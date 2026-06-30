import { db, organizations, users } from "@/lib/db";
import type { UserRole } from "@/lib/db/types";
import { eq } from "drizzle-orm";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveEmail(profile: Record<string, unknown>) {
  const email = profile.email ?? profile.username;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

function resolveOrgFromProfile(profile: Record<string, unknown>, email: string) {
  const orgClaim =
    profile.tenantId ??
    profile.tenantGuid ??
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

export async function upsertUserFromProfile(profile: {
  email?: string | null;
  username?: string | null;
  name?: string | null;
  sub?: string;
  role?: UserRole;
  [key: string]: unknown;
}) {
  const email = resolveEmail(profile);
  if (!email) {
    throw new Error("OAuth profile is missing email");
  }

  const orgInfo = resolveOrgFromProfile(profile, email);
  const role = profile.role ?? resolveRole(profile);

  const existingOrg = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, orgInfo.slug))
    .limit(1);

  let organization = existingOrg[0];
  if (!organization) {
    [organization] = await db
      .insert(organizations)
      .values({ name: orgInfo.name, slug: orgInfo.slug })
      .returning();
  }

  const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existingUser[0]) {
    const [user] = await db
      .update(users)
      .set({
        name: profile.name ?? existingUser[0].name,
        role,
        organizationId: organization.id,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser[0].id))
      .returning();
    return user;
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      name: profile.name ?? email,
      role,
      organizationId: organization.id,
    })
    .returning();

  return user;
}
