import { describe, expect, it } from "vitest";
import {
  buildRuleConditionsPayload,
  conditionRowsFromRule,
  EMPTY_CONDITION_ROW_FIELDS,
  formatRuleCondition,
  parseRuleConditions,
  type ConditionRowFields,
} from "@/lib/routing-rule-display";

const SUPPLIERS = [{ id: "sup-pegasus", name: "Pegasus" }];

function row(patch: Partial<ConditionRowFields> & Pick<ConditionRowFields, "kind">) {
  return { ...EMPTY_CONDITION_ROW_FIELDS, ...patch };
}

describe("formatRuleCondition", () => {
  it("keeps legacy single-condition summaries", () => {
    expect(
      formatRuleCondition(
        "SUPPLIER",
        JSON.stringify({ supplierId: "sup-1", supplierName: "Pegasus" }),
      ),
    ).toBe("Supplier is Pegasus");
    expect(
      formatRuleCondition("SENDER_EMAIL", JSON.stringify({ senderDomain: "acme.com" })),
    ).toBe("Supplier domain is @acme.com");
    expect(
      formatRuleCondition("AMOUNT_THRESHOLD", JSON.stringify({ minAmount: 10000 })),
    ).toBe("Total amount is greater than 10,000");
    expect(
      formatRuleCondition("PARSE_FAILURE", JSON.stringify({ parseFailure: true })),
    ).toBe("Invoice could not be parsed automatically");
    expect(formatRuleCondition("DEFAULT", "{}")).toBe(
      "Matches when no other rule applies",
    );
  });

  it("joins COMBO conditions with 'and'", () => {
    const condition = JSON.stringify({
      conditions: [
        { kind: "SUPPLIER", supplierId: "sup-1", supplierName: "Pegasus" },
        { kind: "ACCOUNT_REFERENCE", value: "Chill Chair", match: "contains" },
      ],
    });
    expect(formatRuleCondition("COMBO", condition)).toBe(
      "Supplier is Pegasus and account reference contains 'Chill Chair'",
    );
  });

  it("formats account reference equals vs contains", () => {
    const equals = JSON.stringify({
      conditions: [{ kind: "ACCOUNT_REFERENCE", value: "Chill Chair", match: "equals" }],
    });
    expect(formatRuleCondition("COMBO", equals)).toBe(
      "Account reference is 'Chill Chair'",
    );
  });

  it("falls back sensibly for broken conditions", () => {
    expect(formatRuleCondition("SUPPLIER", "{}")).toBe("No supplier selected");
    expect(formatRuleCondition("COMBO", "{}")).toBe("No conditions set");
    expect(formatRuleCondition("COMBO", "not json")).toBe("No conditions set");
  });
});

describe("buildRuleConditionsPayload", () => {
  it("keeps a single condition on its legacy type", () => {
    expect(
      buildRuleConditionsPayload([row({ kind: "SUPPLIER", supplierId: "sup-pegasus" })], SUPPLIERS),
    ).toEqual({
      type: "SUPPLIER",
      condition: { supplierId: "sup-pegasus", supplierName: "Pegasus" },
    });

    expect(
      buildRuleConditionsPayload(
        [row({ kind: "SENDER_EMAIL", senderDomain: "acme.com" })],
        SUPPLIERS,
      ),
    ).toEqual({ type: "SENDER_EMAIL", condition: { senderDomain: "acme.com" } });

    expect(
      buildRuleConditionsPayload([row({ kind: "AMOUNT_THRESHOLD", minAmount: "500" })], SUPPLIERS),
    ).toEqual({ type: "AMOUNT_THRESHOLD", condition: { minAmount: 500 } });

    expect(buildRuleConditionsPayload([row({ kind: "PARSE_FAILURE" })], SUPPLIERS)).toEqual({
      type: "PARSE_FAILURE",
      condition: { parseFailure: true },
    });
  });

  it("saves a single account reference condition as COMBO (no legacy type exists)", () => {
    expect(
      buildRuleConditionsPayload(
        [row({ kind: "ACCOUNT_REFERENCE", accountValue: " Chill Chair ", accountMatch: "contains" })],
        SUPPLIERS,
      ),
    ).toEqual({
      type: "COMBO",
      condition: {
        conditions: [{ kind: "ACCOUNT_REFERENCE", value: "Chill Chair", match: "contains" }],
      },
    });
  });

  it("saves multiple conditions as COMBO", () => {
    const payload = buildRuleConditionsPayload(
      [
        row({ kind: "SUPPLIER", supplierId: "sup-pegasus" }),
        row({ kind: "ACCOUNT_REFERENCE", accountValue: "Chill Chair", accountMatch: "contains" }),
      ],
      SUPPLIERS,
    );
    expect(payload).toEqual({
      type: "COMBO",
      condition: {
        conditions: [
          { kind: "SUPPLIER", supplierId: "sup-pegasus", supplierName: "Pegasus" },
          { kind: "ACCOUNT_REFERENCE", value: "Chill Chair", match: "contains" },
        ],
      },
    });
  });

  it("surfaces per-condition validation errors", () => {
    expect(buildRuleConditionsPayload([], SUPPLIERS)).toHaveProperty("error");
    expect(
      buildRuleConditionsPayload([row({ kind: "SUPPLIER" })], SUPPLIERS),
    ).toHaveProperty("error");
    expect(
      buildRuleConditionsPayload([row({ kind: "SENDER_EMAIL" })], SUPPLIERS),
    ).toHaveProperty("error");
    expect(
      buildRuleConditionsPayload([row({ kind: "AMOUNT_THRESHOLD", minAmount: "abc" })], SUPPLIERS),
    ).toHaveProperty("error");
    expect(
      buildRuleConditionsPayload(
        [row({ kind: "ACCOUNT_REFERENCE", accountValue: "  " })],
        SUPPLIERS,
      ),
    ).toHaveProperty("error");
  });
});

describe("conditionRowsFromRule", () => {
  it("loads a legacy rule as a single editable row", () => {
    const rows = conditionRowsFromRule(
      "SUPPLIER",
      JSON.stringify({ supplierId: "sup-pegasus", supplierName: "Pegasus" }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("SUPPLIER");
    expect(rows[0].supplierId).toBe("sup-pegasus");
  });

  it("loads a COMBO rule as one row per condition", () => {
    const rows = conditionRowsFromRule(
      "COMBO",
      JSON.stringify({
        conditions: [
          { kind: "SUPPLIER", supplierId: "sup-pegasus" },
          { kind: "ACCOUNT_REFERENCE", value: "Chill Chair", match: "equals" },
          { kind: "AMOUNT_THRESHOLD", minAmount: 250 },
        ],
      }),
    );
    expect(rows.map((r) => r.kind)).toEqual([
      "SUPPLIER",
      "ACCOUNT_REFERENCE",
      "AMOUNT_THRESHOLD",
    ]);
    expect(rows[1].accountValue).toBe("Chill Chair");
    expect(rows[1].accountMatch).toBe("equals");
    expect(rows[2].minAmount).toBe("250");
  });
});

describe("parseRuleConditions", () => {
  it("drops unusable COMBO members for display", () => {
    const conditions = parseRuleConditions(
      "COMBO",
      JSON.stringify({
        conditions: [{ kind: "SUPPLIER", supplierId: "sup-1" }, { kind: "NONSENSE" }],
      }),
    );
    expect(conditions).toEqual([{ kind: "SUPPLIER", supplierId: "sup-1", supplierName: undefined }]);
  });
});
