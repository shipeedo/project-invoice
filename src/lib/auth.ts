import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import type { UserRole } from "@/lib/db/types";
import {
  authorizeSignInFromProfile,
  getUserAccessById,
  getUserByEmail,
  upsertUserFromProfile,
} from "@/lib/users";

const useMockAuth =
  process.env.AUTH_MOCK === "true" ||
  (!process.env.CLIENT_SECRET && process.env.NODE_ENV === "development");

const providers: NextAuthConfig["providers"] = useMockAuth
  ? [
      Credentials({
        id: "mock",
        name: "Development login",
        credentials: {
          email: { label: "Email", type: "email" },
          name: { label: "Name", type: "text" },
          role: { label: "Role (ADMIN, APPROVER, USER)", type: "text" },
        },
        async authorize(credentials) {
          const email = credentials?.email as string;
          if (!email) return null;

          const roleInput = (credentials?.role as string | undefined)?.toUpperCase();
          const role: UserRole =
            roleInput === "ADMIN" || roleInput === "USER" || roleInput === "APPROVER"
              ? roleInput
              : "ADMIN";

          // Mock login is a dev-only backdoor, so it always grants access.
          const user = await upsertUserFromProfile(
            {
              email,
              name: (credentials?.name as string) || email,
              role,
            },
            { grantAccess: true },
          );

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            organizationId: user.organizationId,
          };
        },
      }),
    ]
  : [
      {
        id: "shipeedo",
        name: "Shipeedo",
        type: "oidc",
        issuer: process.env.OIDC_ISSUER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        authorization: {
          params: {
            scope: "openid profile tenantGuid tenant:2 offline_access",
          },
        },
        profile(profile) {
          return {
            id: String(profile.userId ?? profile.sub),
            email: profile.username,
            name: profile.name ?? profile.username,
            image: profile.profileImageUrl,
            tenantId: profile.tenantId,
            tenantGuid: profile.tenantGuid,
            roles: profile.roles,
            permissions: profile.permissions,
            // Tenant admins are identified structurally: a token with neither
            // a customerId nor a driverId belongs to a tenant-level admin.
            customerId: profile.customerId ?? null,
            driverId: profile.driverId ?? null,
          };
        },
      },
    ];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, user, profile }) {
      // Mock credentials are vetted in authorize(); the Shipeedo token alone
      // is not enough — the user must be designated in the Users section.
      if (account?.provider !== "shipeedo") return true;
      const dbUser = await authorizeSignInFromProfile(
        (user ?? profile) as {
          email?: string;
          username?: string;
          name?: string;
          sub?: string;
          [key: string]: unknown;
        },
      );
      return Boolean(dbUser);
    },
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as { role?: UserRole }).role;
        token.organizationId = (user as { organizationId?: string }).organizationId;
      }

      if (account?.provider === "shipeedo") {
        // Keep the tenant access token so server routes can call the tenant API.
        if (account.access_token) token.accessToken = account.access_token;

        const source = (user ?? profile) as { email?: string; username?: string } | undefined;
        const email = source?.email ?? source?.username;
        // Already upserted by the signIn callback; just map onto the token.
        const dbUser = typeof email === "string" ? await getUserByEmail(email) : null;
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.organizationId = dbUser.organizationId;
          token.name = dbUser.name;
          token.email = dbUser.email;
        }
      }

      // On subsequent requests, re-check access so removing a user also ends
      // their existing session, and role changes apply without re-login.
      if (!user && !account && typeof token.userId === "string") {
        const dbUser = await getUserAccessById(token.userId);
        if (!dbUser?.hasAccess) return null;
        token.role = dbUser.role;
        token.organizationId = dbUser.organizationId;
        token.name = dbUser.name;
        token.email = dbUser.email;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as UserRole;
        session.user.organizationId = token.organizationId as string;
      }
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
});
