import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import type { UserRole } from "@/lib/db/types";
import { upsertUserFromProfile } from "@/lib/users";

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

          const user = await upsertUserFromProfile({
            email,
            name: (credentials?.name as string) || email,
            role,
          });

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
          };
        },
      },
    ];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as { role?: UserRole }).role;
        token.organizationId = (user as { organizationId?: string }).organizationId;
      }

      if (account?.provider === "shipeedo" && (user || profile)) {
        const dbUser = await upsertUserFromProfile(
          (user ?? profile) as {
            email?: string;
            username?: string;
            name?: string;
            sub?: string;
            [key: string]: unknown;
          },
        );
        token.userId = dbUser.id;
        token.role = dbUser.role;
        token.organizationId = dbUser.organizationId;
        token.name = dbUser.name;
        token.email = dbUser.email;
      }

      return token;
    },
  },
});
