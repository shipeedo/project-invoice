import { db, organizations, users } from "@/lib/db";
import type { UserRole } from "@/lib/db/types";
import { userRoles } from "@/lib/db/types";
import { and, eq, sql } from "drizzle-orm";

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

export function resolveRoleFromProfile(profile: Record<string, unknown>): UserRole | null {
  const role = profile.role ?? profile.roles;
  if (typeof role === "string") {
    const normalized = role.toUpperCase();
    if (normalized === "ADMIN") return "ADMIN";
    if (normalized === "USER") return "USER";
    if (normalized === "APPROVER") return "APPROVER";
  }
  if (Array.isArray(role)) {
    const normalized = role.map((entry) => String(entry).toLowerCase());
    if (normalized.includes("admin")) return "ADMIN";
  }

  // Shipeedo tokens express tenant admins structurally, not via a role claim:
  // a token with neither a customerId nor a driverId is a tenant-level admin.
  // Only infer this when the claims are actually present on the profile.
  if ("customerId" in profile || "driverId" in profile) {
    if (profile.customerId == null && profile.driverId == null) return "ADMIN";
  }

  return null;
}

type OAuthProfile = {
  email?: string | null;
  username?: string | null;
  name?: string | null;
  sub?: string;
  role?: UserRole;
  [key: string]: unknown;
};

export async function upsertUserFromProfile(
  profile: OAuthProfile,
  options?: { grantAccess?: boolean },
) {
  const email = resolveEmail(profile);
  if (!email) {
    throw new Error("OAuth profile is missing email");
  }

  const orgInfo = resolveOrgFromProfile(profile, email);
  const profileRole =
    profile.role && userRoles.includes(profile.role as UserRole)
      ? (profile.role as UserRole)
      : resolveRoleFromProfile(profile);

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

  const existingUser = await getUserByEmail(email);

  if (existingUser) {
    const role = profileRole ?? existingUser.role;
    const [user] = await db
      .update(users)
      .set({
        name: profile.name ?? existingUser.name,
        role,
        // Keep the organization the user was designated into — re-resolving it
        // from the profile on login would move them out of the admin's org.
        hasAccess: options?.grantAccess ? true : existingUser.hasAccess,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id))
      .returning();
    return user;
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      name: profile.name ?? email,
      role: profileRole ?? "APPROVER",
      organizationId: organization.id,
      hasAccess: options?.grantAccess ?? false,
    })
    .returning();

  return user;
}

export type SignInAccessDecision = "ALLOW" | "BOOTSTRAP_ADMIN" | "DENY";

// A valid token from the auth server is not enough: access is granted only to
// users designated in the admin Users section. The one exception is the first
// admin to reach an organization with no designated users yet — otherwise a
// fresh install could never be administered.
export function decideSignInAccess(params: {
  existingUser: { hasAccess: boolean } | null;
  orgHasDesignatedUsers: boolean;
  profileRole: UserRole | null;
}): SignInAccessDecision {
  if (params.existingUser?.hasAccess) return "ALLOW";
  if (!params.orgHasDesignatedUsers && params.profileRole === "ADMIN") {
    return "BOOTSTRAP_ADMIN";
  }
  return "DENY";
}

export async function authorizeSignInFromProfile(profile: OAuthProfile) {
  const email = resolveEmail(profile);
  if (!email) return null;

  const existing = await getUserByEmail(email);
  if (existing?.hasAccess) {
    // Sync the display name only. Role and organization were set when the
    // admin designated this user and stay under the admin's control.
    const [user] = await db
      .update(users)
      .set({ name: profile.name ?? existing.name, updatedAt: new Date() })
      .where(eq(users.id, existing.id))
      .returning();
    return user;
  }

  const orgInfo = resolveOrgFromProfile(profile, email);
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgInfo.slug))
    .limit(1);

  let orgHasDesignatedUsers = false;
  if (organization) {
    const [designated] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.organizationId, organization.id), eq(users.hasAccess, true)))
      .limit(1);
    orgHasDesignatedUsers = Boolean(designated);
  }

  const profileRole =
    profile.role && userRoles.includes(profile.role as UserRole)
      ? (profile.role as UserRole)
      : resolveRoleFromProfile(profile);

  const decision = decideSignInAccess({
    existingUser: existing,
    orgHasDesignatedUsers,
    profileRole,
  });
  if (decision === "DENY") return null;

  return upsertUserFromProfile(profile, { grantAccess: true });
}

// Case-insensitive: designated emails may not match the OIDC profile's casing.
export async function getUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return user ?? null;
}

export async function getUserAccessById(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      organizationId: users.organizationId,
      hasAccess: users.hasAccess,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}
