import { describe, expect, it } from "vitest";
import { resolveEscalation, type EscalationRuleLike } from "@/lib/escalations";

const APPROVER = "user-approver";
const MANAGER = "user-manager";
const BACKUP = "user-backup";

function rule(overrides: Partial<EscalationRuleLike> = {}): EscalationRuleLike {
  return {
    id: "rule-1",
    watchedUserId: null,
    afterBusinessDays: 2,
    escalateToId: MANAGER,
    enabled: true,
    ...overrides,
  };
}

function invoice(overrides: Partial<Parameters<typeof resolveEscalation>[0]> = {}) {
  return {
    assignedToId: APPROVER,
    // Monday
    assignedAt: new Date(2026, 6, 6, 9, 0),
    createdAt: new Date(2026, 6, 1),
    ...overrides,
  };
}

describe("resolveEscalation", () => {
  it("fires once the business-day window has fully elapsed", () => {
    // Assigned Monday with a 2-business-day window: still theirs Tuesday,
    // escalates Wednesday.
    const rules = [rule()];
    expect(
      resolveEscalation(invoice(), rules, new Date(2026, 6, 7, 17, 0)),
    ).toBeNull();
    expect(
      resolveEscalation(invoice(), rules, new Date(2026, 6, 8, 0, 30)),
    ).toEqual(rules[0]);
  });

  it("skips weekends when counting the window", () => {
    // Assigned Friday 10 July with a 1-business-day window → Monday 13 July.
    const rules = [rule({ afterBusinessDays: 1 })];
    const fridayInvoice = invoice({ assignedAt: new Date(2026, 6, 10, 9, 0) });
    expect(
      resolveEscalation(fridayInvoice, rules, new Date(2026, 6, 12)),
    ).toBeNull();
    expect(
      resolveEscalation(fridayInvoice, rules, new Date(2026, 6, 13)),
    ).toEqual(rules[0]);
  });

  it("ignores unassigned invoices and disabled or targetless rules", () => {
    const now = new Date(2026, 6, 20);
    expect(
      resolveEscalation(invoice({ assignedToId: null }), [rule()], now),
    ).toBeNull();
    expect(
      resolveEscalation(invoice(), [rule({ enabled: false })], now),
    ).toBeNull();
    expect(
      resolveEscalation(invoice(), [rule({ escalateToId: null })], now),
    ).toBeNull();
  });

  it("never reassigns an invoice to the person who already has it", () => {
    expect(
      resolveEscalation(
        invoice({ assignedToId: MANAGER }),
        [rule()],
        new Date(2026, 6, 20),
      ),
    ).toBeNull();
  });

  it("prefers a rule watching the assignee over the catch-all", () => {
    const catchAll = rule({ id: "catch-all", afterBusinessDays: 1 });
    const specific = rule({
      id: "specific",
      watchedUserId: APPROVER,
      afterBusinessDays: 3,
      escalateToId: BACKUP,
    });
    const resolved = resolveEscalation(
      invoice(),
      [catchAll, specific],
      new Date(2026, 6, 20),
    );
    expect(resolved?.id).toBe("specific");
  });

  it("does not match a rule watching a different assignee", () => {
    const other = rule({ watchedUserId: MANAGER });
    expect(
      resolveEscalation(invoice(), [other], new Date(2026, 6, 20)),
    ).toBeNull();
  });

  it("uses the shortest window among equally specific rules", () => {
    const slow = rule({ id: "slow", afterBusinessDays: 5 });
    const fast = rule({ id: "fast", afterBusinessDays: 2, escalateToId: BACKUP });
    const resolved = resolveEscalation(
      invoice(),
      [slow, fast],
      new Date(2026, 6, 8),
    );
    expect(resolved?.id).toBe("fast");
  });

  it("falls back to validatedAt then createdAt when assignedAt is missing", () => {
    const rules = [rule({ afterBusinessDays: 2 })];
    const legacy = invoice({
      assignedAt: null,
      validatedAt: new Date(2026, 6, 6),
      createdAt: new Date(2026, 6, 1),
    });
    expect(resolveEscalation(legacy, rules, new Date(2026, 6, 8))).toEqual(
      rules[0],
    );
  });
});
