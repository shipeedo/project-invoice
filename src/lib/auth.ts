import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import type { UserRole } from "@prisma/client";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveOrgFromProfile(profile: Record<string, unknown>, email: string) {
  const orgClaim =
    profile.org_id ??
    profile.organization_id ??
    profile.tenant_id ??
    profile.organization;

  if (typeof orgClaim === "string" && orgClaim.trim()) {
    return {
      slug: slugify(orgClaim),
      name: typeof profile.organization === "string" ? profile.organization : orgClaim,
    };
  }

  const domain = email.split("@")[1] ?? "default";
  return {
    slug: slugify(domain),
    name: domain,
  };
}

function resolveRole(profile: Record<string, unknown>): UserRole {
  const role = profile.role ?? profile.roles;
  if (typeof role === "string") {
    const normalized = role.toUpperCase();
    if (normalized === "ADMIN") return "ADMIN";
    if (normalized === "USER") return "USER";
  }
  if (Array.isArray(role) && role.includes("admin")) return "ADMIN";
  return "APPROVER";
}

async function upsertUserFromProfile(profile: {
  email?: string | null;
  name?: string | null;
  sub?: string;
  [key: string]: unknown;
}) {
  const email = profile.email;
  if (!email) {
    throw new Error("OAuth profile is missing email");
  }

  const orgInfo = resolveOrgFromProfile(profile, email);
  const organization =
    (await db.organization.findUnique({ where: { slug: orgInfo.slug } })) ??
    (await db.organization.create({
      data: { slug: orgInfo.slug, name: orgInfo.name },
    }));

  const role = resolveRole(profile);
  const user = await db.user.upsert({
    where: { email },
    update: {
      name: profile.name ?? undefined,
      role,
      organizationId: organization.id,
    },
    create: {
      email,
      name: profile.name ?? email,
      role,
      organizationId: organization.id,
    },
    include: { organization: true },
  });

  return user;
}

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
            scope: "openid email profile offline_access",
          },
        },
      },
    ];

export const authConfig: NextAuthConfig = {
  providers,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as { role?: UserRole }).role;
        token.organizationId = (user as { organizationId?: string }).organizationId;
      }

      if (account?.provider === "shipeedo" && profile) {
        const dbUser = await upsertUserFromProfile(
          profile as { email?: string; name?: string; sub?: string; [key: string]: unknown },
        );
        token.userId = dbUser.id;
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
      return session;
    },
  },
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
