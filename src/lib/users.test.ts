import { describe, expect, it } from "vitest";
import { decideSignInAccess, resolveRoleFromProfile } from "@/lib/users";

describe("resolveRoleFromProfile", () => {
  it("treats a token with neither customerId nor driverId as a tenant admin", () => {
    expect(resolveRoleFromProfile({ customerId: null, driverId: null })).toBe("ADMIN");
    expect(resolveRoleFromProfile({ customerId: undefined, driverId: undefined })).toBe(
      "ADMIN",
    );
  });

  it("does not treat customer or driver tokens as admins", () => {
    expect(resolveRoleFromProfile({ customerId: 42, driverId: null })).toBeNull();
    expect(resolveRoleFromProfile({ customerId: null, driverId: 7 })).toBeNull();
  });

  it("does not infer tenant admin when the claims are absent", () => {
    expect(resolveRoleFromProfile({})).toBeNull();
    expect(resolveRoleFromProfile({ roles: [] })).toBeNull();
  });

  it("still honours explicit role claims first", () => {
    expect(resolveRoleFromProfile({ roles: ["Admin"], customerId: 42 })).toBe("ADMIN");
    expect(resolveRoleFromProfile({ role: "APPROVER" })).toBe("APPROVER");
  });
});

describe("decideSignInAccess", () => {
  it("allows a designated user regardless of role", () => {
    expect(
      decideSignInAccess({
        existingUser: { hasAccess: true },
        orgHasDesignatedUsers: true,
        profileRole: "USER",
      }),
    ).toBe("ALLOW");
  });

  it("denies a known user whose access was revoked", () => {
    expect(
      decideSignInAccess({
        existingUser: { hasAccess: false },
        orgHasDesignatedUsers: true,
        profileRole: "ADMIN",
      }),
    ).toBe("DENY");
  });

  it("denies an unknown user even with a valid token", () => {
    expect(
      decideSignInAccess({
        existingUser: null,
        orgHasDesignatedUsers: true,
        profileRole: "APPROVER",
      }),
    ).toBe("DENY");
  });

  it("bootstraps the first admin into an empty organization", () => {
    expect(
      decideSignInAccess({
        existingUser: null,
        orgHasDesignatedUsers: false,
        profileRole: "ADMIN",
      }),
    ).toBe("BOOTSTRAP_ADMIN");
  });

  it("does not bootstrap non-admins into an empty organization", () => {
    expect(
      decideSignInAccess({
        existingUser: null,
        orgHasDesignatedUsers: false,
        profileRole: "USER",
      }),
    ).toBe("DENY");

    expect(
      decideSignInAccess({
        existingUser: null,
        orgHasDesignatedUsers: false,
        profileRole: null,
      }),
    ).toBe("DENY");
  });
});
