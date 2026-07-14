import { describe, expect, it } from "vitest";
import { db, invoices, organizations, routingRules, suppliers, users } from "@/lib/db";
import {
  assignApproverForInvoice,
  matchesRuleCondition,
  normalizeRuleConditions,
  ruleMatchesInvoice,
  validateRuleConditionInput,
  type RoutingInvoice,
} from "@/lib/routing";

function invoiceLike(overrides: Partial<RoutingInvoice> = {}): RoutingInvoice {
  return {
    supplierId: null,
    vendorEmail: null,
    totalAmount: null,
    parseError: null,
    accountReference: null,
    ...overrides,
  };
}

function rule(type: string, condition: unknown) {
  return { type, condition: JSON.stringify(condition) };
}

describe("normalizeRuleConditions (legacy shapes)", () => {
  it("normalizes each legacy row into a one-element condition list", () => {
    expect(
      normalizeRuleConditions(rule("SUPPLIER", { supplierId: "sup-1", supplierName: "Acme" })),
    ).toEqual([{ kind: "SUPPLIER", supplierId: "sup-1", supplierName: "Acme" }]);

    expect(
      normalizeRuleConditions(rule("SENDER_EMAIL", { senderDomain: "acme.com" })),
    ).toEqual([{ kind: "SENDER_EMAIL", senderDomain: "acme.com" }]);

    expect(normalizeRuleConditions(rule("AMOUNT_THRESHOLD", { minAmount: 500 }))).toEqual([
      { kind: "AMOUNT_THRESHOLD", minAmount: 500 },
    ]);

    expect(normalizeRuleConditions(rule("PARSE_FAILURE", { parseFailure: true }))).toEqual([
      { kind: "PARSE_FAILURE" },
    ]);
  });

  it("returns null for unusable rows so they never match", () => {
    expect(normalizeRuleConditions({ type: "SUPPLIER", condition: "not json" })).toBeNull();
    expect(normalizeRuleConditions(rule("SUPPLIER", {}))).toBeNull();
    expect(normalizeRuleConditions(rule("COMBO", { conditions: [] }))).toBeNull();
    expect(
      normalizeRuleConditions(rule("COMBO", { conditions: [{ kind: "NONSENSE" }] })),
    ).toBeNull();
    expect(normalizeRuleConditions(rule("DEFAULT", {}))).toBeNull();
  });

  it("keeps a COMBO with any invalid member from matching at all", () => {
    const combo = rule("COMBO", {
      conditions: [
        { kind: "SUPPLIER", supplierId: "sup-1" },
        { kind: "ACCOUNT_REFERENCE", value: "", match: "equals" },
      ],
    });
    expect(normalizeRuleConditions(combo)).toBeNull();
    expect(ruleMatchesInvoice(combo, invoiceLike({ supplierId: "sup-1" }))).toBe(false);
  });
});

describe("legacy rule matching still works", () => {
  it("matches suppliers by id", () => {
    const supplierRule = rule("SUPPLIER", { supplierId: "sup-1" });
    expect(ruleMatchesInvoice(supplierRule, invoiceLike({ supplierId: "sup-1" }))).toBe(true);
    expect(ruleMatchesInvoice(supplierRule, invoiceLike({ supplierId: "sup-2" }))).toBe(false);
    expect(ruleMatchesInvoice(supplierRule, invoiceLike())).toBe(false);
  });

  it("matches sender emails and domains case-insensitively", () => {
    const emailRule = rule("SENDER_EMAIL", { senderEmail: "billing@acme.com" });
    expect(
      ruleMatchesInvoice(emailRule, invoiceLike({ vendorEmail: "Billing@Acme.com" })),
    ).toBe(true);

    const domainRule = rule("SENDER_EMAIL", { senderDomain: "acme.com" });
    expect(
      ruleMatchesInvoice(domainRule, invoiceLike({ vendorEmail: "jo@ACME.com" })),
    ).toBe(true);
    expect(
      ruleMatchesInvoice(domainRule, invoiceLike({ vendorEmail: "jo@other.com" })),
    ).toBe(false);
  });

  it("matches amounts strictly above the threshold", () => {
    const amountRule = rule("AMOUNT_THRESHOLD", { minAmount: 1000 });
    expect(ruleMatchesInvoice(amountRule, invoiceLike({ totalAmount: 1000.01 }))).toBe(true);
    expect(ruleMatchesInvoice(amountRule, invoiceLike({ totalAmount: 1000 }))).toBe(false);
    expect(ruleMatchesInvoice(amountRule, invoiceLike())).toBe(false);
  });

  it("matches parse failures", () => {
    const parseRule = rule("PARSE_FAILURE", { parseFailure: true });
    expect(ruleMatchesInvoice(parseRule, invoiceLike({ parseError: "boom" }))).toBe(true);
    expect(ruleMatchesInvoice(parseRule, invoiceLike())).toBe(false);
  });
});

describe("ACCOUNT_REFERENCE conditions", () => {
  const equals = {
    kind: "ACCOUNT_REFERENCE",
    value: "Chill Chair",
    match: "equals",
  } as const;
  const contains = {
    kind: "ACCOUNT_REFERENCE",
    value: "Chill Chair",
    match: "contains",
  } as const;

  it("equals is case-insensitive and trimmed", () => {
    expect(
      matchesRuleCondition(equals, invoiceLike({ accountReference: "  CHILL chair " })),
    ).toBe(true);
    expect(
      matchesRuleCondition(equals, invoiceLike({ accountReference: "Chill Chair 42" })),
    ).toBe(false);
  });

  it("contains matches substrings case-insensitively", () => {
    expect(
      matchesRuleCondition(contains, invoiceLike({ accountReference: "Acct: CHILL CHAIR - 42" })),
    ).toBe(true);
    expect(
      matchesRuleCondition(contains, invoiceLike({ accountReference: "Warm Sofa" })),
    ).toBe(false);
  });

  it("never matches when the invoice has no account reference", () => {
    expect(matchesRuleCondition(equals, invoiceLike())).toBe(false);
    expect(matchesRuleCondition(contains, invoiceLike({ accountReference: "   " }))).toBe(
      false,
    );
  });
});

describe("COMBO AND semantics", () => {
  const combo = rule("COMBO", {
    conditions: [
      { kind: "SUPPLIER", supplierId: "pegasus" },
      { kind: "ACCOUNT_REFERENCE", value: "Chill Chair", match: "contains" },
    ],
  });

  it("matches only when every condition matches", () => {
    expect(
      ruleMatchesInvoice(
        combo,
        invoiceLike({ supplierId: "pegasus", accountReference: "chill chair" }),
      ),
    ).toBe(true);
    expect(ruleMatchesInvoice(combo, invoiceLike({ supplierId: "pegasus" }))).toBe(false);
    expect(
      ruleMatchesInvoice(combo, invoiceLike({ accountReference: "chill chair" })),
    ).toBe(false);
  });
});

describe("validateRuleConditionInput", () => {
  it("accepts legacy single-condition payloads", () => {
    expect(validateRuleConditionInput("SUPPLIER", { supplierId: "sup-1" })).toEqual({
      ok: true,
      condition: { supplierId: "sup-1" },
    });
    expect(
      validateRuleConditionInput("SENDER_EMAIL", { senderDomain: "acme.com" }).ok,
    ).toBe(true);
    expect(validateRuleConditionInput("AMOUNT_THRESHOLD", { minAmount: 100 }).ok).toBe(true);
    expect(validateRuleConditionInput("PARSE_FAILURE", {})).toEqual({
      ok: true,
      condition: { parseFailure: true },
    });
    expect(validateRuleConditionInput("DEFAULT", {})).toEqual({ ok: true, condition: {} });
  });

  it("accepts a valid COMBO payload", () => {
    const result = validateRuleConditionInput("COMBO", {
      conditions: [
        { kind: "SUPPLIER", supplierId: "pegasus" },
        { kind: "ACCOUNT_REFERENCE", value: "Chill Chair", match: "contains" },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects bad payloads", () => {
    expect(validateRuleConditionInput("COMBO", { conditions: [] }).ok).toBe(false);
    expect(
      validateRuleConditionInput("COMBO", { conditions: [{ kind: "NONSENSE" }] }).ok,
    ).toBe(false);
    expect(
      validateRuleConditionInput("COMBO", {
        conditions: [{ kind: "ACCOUNT_REFERENCE", value: "   ", match: "equals" }],
      }).ok,
    ).toBe(false);
    expect(validateRuleConditionInput("SUPPLIER", {}).ok).toBe(false);
    expect(validateRuleConditionInput("SENDER_EMAIL", {}).ok).toBe(false);
    expect(validateRuleConditionInput("AMOUNT_THRESHOLD", { minAmount: "10" }).ok).toBe(
      false,
    );
    expect(validateRuleConditionInput("NOT_A_TYPE", {}).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DB-backed engine tests (in-memory SQLite via vitest.setup.ts)
// ---------------------------------------------------------------------------

async function seedOrg(slug: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `Org ${slug}`, slug })
    .returning();

  const [kate] = await db
    .insert(users)
    .values({ organizationId: org.id, email: `kate-${slug}@example.com`, name: "Kate" })
    .returning();

  const [fallback] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      email: `fallback-${slug}@example.com`,
      name: "Fallback",
    })
    .returning();

  const [pegasus] = await db
    .insert(suppliers)
    .values({ organizationId: org.id, name: "Pegasus" })
    .returning();

  return { org, kate, fallback, pegasus };
}

async function insertInvoice(
  organizationId: string,
  values: Partial<typeof invoices.$inferInsert> = {},
) {
  const [invoice] = await db
    .insert(invoices)
    .values({ organizationId, ...values })
    .returning();
  return invoice;
}

describe("assignApproverForInvoice", () => {
  it("routes the supplier + account reference COMBO from the ask to Kate", async () => {
    const { org, kate, fallback, pegasus } = await seedOrg("combo");

    await db.insert(routingRules).values([
      {
        organizationId: org.id,
        name: "Pegasus / Chill Chair",
        priority: 100,
        type: "COMBO",
        condition: JSON.stringify({
          conditions: [
            { kind: "SUPPLIER", supplierId: pegasus.id, supplierName: "Pegasus" },
            { kind: "ACCOUNT_REFERENCE", value: "Chill Chair", match: "contains" },
          ],
        }),
        approverId: kate.id,
      },
      {
        organizationId: org.id,
        name: "Everything else",
        priority: 0,
        type: "DEFAULT",
        condition: "{}",
        approverId: fallback.id,
        isDefault: true,
      },
    ]);

    const matching = await insertInvoice(org.id, {
      supplierId: pegasus.id,
      accountReference: "CHILL CHAIR",
    });
    expect((await assignApproverForInvoice(org.id, matching))?.id).toBe(kate.id);

    // Supplier alone is not enough: no account reference falls to the default.
    const noAccount = await insertInvoice(org.id, { supplierId: pegasus.id });
    expect((await assignApproverForInvoice(org.id, noAccount))?.id).toBe(fallback.id);

    // Account alone is not enough either.
    const wrongSupplier = await insertInvoice(org.id, {
      accountReference: "Chill Chair",
    });
    expect((await assignApproverForInvoice(org.id, wrongSupplier))?.id).toBe(fallback.id);
  });

  it("still honours legacy rows and priority order", async () => {
    const { org, kate, fallback, pegasus } = await seedOrg("legacy");

    await db.insert(routingRules).values([
      {
        organizationId: org.id,
        name: "Pegasus invoices",
        priority: 100,
        type: "SUPPLIER",
        condition: JSON.stringify({ supplierId: pegasus.id, supplierName: "Pegasus" }),
        approverId: kate.id,
      },
      {
        organizationId: org.id,
        name: "Everything else",
        priority: 0,
        type: "DEFAULT",
        condition: "{}",
        approverId: fallback.id,
        isDefault: true,
      },
    ]);

    const fromPegasus = await insertInvoice(org.id, { supplierId: pegasus.id });
    expect((await assignApproverForInvoice(org.id, fromPegasus))?.id).toBe(kate.id);

    const other = await insertInvoice(org.id, {});
    expect((await assignApproverForInvoice(org.id, other))?.id).toBe(fallback.id);
  });

  it("skips disabled rules and returns null with no default", async () => {
    const { org, kate, pegasus } = await seedOrg("disabled");

    await db.insert(routingRules).values({
      organizationId: org.id,
      name: "Paused",
      priority: 100,
      type: "SUPPLIER",
      condition: JSON.stringify({ supplierId: pegasus.id }),
      approverId: kate.id,
      enabled: false,
    });

    const invoice = await insertInvoice(org.id, { supplierId: pegasus.id });
    expect(await assignApproverForInvoice(org.id, invoice)).toBeNull();
  });
});
