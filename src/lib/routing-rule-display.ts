import type { RoutingRuleType } from "@/lib/db/types";
import type { RuleCondition } from "@/lib/routing";

// Condition kinds a user can pick inside a rule. DEFAULT is not a condition —
// it's the catch-all rule type handled separately.
export type ConditionKind = RuleCondition["kind"];

export const CONDITION_KIND_INFO: Record<
  ConditionKind,
  { label: string; helper: string }
> = {
  SUPPLIER: {
    label: "From a supplier",
    helper:
      "Matches every invoice linked to this supplier, whichever address they send from.",
  },
  SENDER_EMAIL: {
    label: "From an email or domain",
    helper:
      "Matches the supplier email address or domain extracted from the invoice.",
  },
  AMOUNT_THRESHOLD: {
    label: "Over an amount",
    helper: "Matches invoices with a total greater than this amount.",
  },
  ACCOUNT_REFERENCE: {
    label: "Account reference",
    helper:
      "Matches the account / cost centre / reference / department value read from the invoice.",
  },
  PARSE_FAILURE: {
    label: "Couldn't be read",
    helper: "Matches invoices that failed automatic extraction.",
  },
};

export const RULE_TYPE_INFO: Record<
  RoutingRuleType,
  { label: string; description: string; example: string }
> = {
  SUPPLIER: {
    label: "Supplier",
    description:
      "Matches invoices linked to one of your suppliers, whichever address they send from.",
    example:
      'e.g. supplier "Acme Logistics" routes every invoice from any of their email addresses or domains.',
  },
  SENDER_EMAIL: {
    label: "Sender email or domain",
    description:
      "Matches invoices from a specific supplier email address or email domain extracted from the PDF.",
    example:
      'e.g. sender email "billing@acme.com" or domain "acme.com" to route all invoices from that supplier.',
  },
  AMOUNT_THRESHOLD: {
    label: "Amount threshold",
    description:
      "Matches invoices whose total amount is greater than the threshold you set.",
    example:
      'e.g. minimum amount 10000 routes invoices over $10,000.00 to a senior approver.',
  },
  PARSE_FAILURE: {
    label: "Parse failure",
    description:
      "Matches invoices the system could not read automatically and flagged for manual review.",
    example:
      "e.g. unreadable PDFs or missing fields go to an admin for data entry before approval.",
  },
  COMBO: {
    label: "Multiple conditions",
    description:
      "Matches only when every one of its conditions is true — combine supplier, amount, and account reference checks.",
    example:
      'e.g. supplier "Pegasus" AND account reference "Chill Chair" routes that account\'s invoices to its approver.',
  },
  DEFAULT: {
    label: "Default (catch-all)",
    description:
      "Assigns any invoice that does not match a higher-priority rule. Every organisation needs exactly one default rule.",
    example:
      'e.g. "General inbox" — all routine invoices that pass other checks land here.',
  },
};

export function formatRuleType(type: string): string {
  return RULE_TYPE_INFO[type as RoutingRuleType]?.label ?? type;
}

// ---------------------------------------------------------------------------
// Parsing stored conditions (display-lenient)
// ---------------------------------------------------------------------------

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function coerceCondition(raw: unknown): RuleCondition | null {
  if (raw == null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  switch (record.kind) {
    case "SUPPLIER": {
      const supplierId = asTrimmedString(record.supplierId);
      if (!supplierId) return null;
      const supplierName = asTrimmedString(record.supplierName);
      return {
        kind: "SUPPLIER",
        supplierId,
        supplierName: supplierName || undefined,
      };
    }
    case "SENDER_EMAIL": {
      const senderEmail = asTrimmedString(record.senderEmail);
      const senderDomain = asTrimmedString(record.senderDomain);
      if (!senderEmail && !senderDomain) return null;
      return {
        kind: "SENDER_EMAIL",
        senderEmail: senderEmail || undefined,
        senderDomain: senderDomain || undefined,
      };
    }
    case "AMOUNT_THRESHOLD": {
      const minAmount = record.minAmount;
      if (typeof minAmount !== "number" || !Number.isFinite(minAmount)) return null;
      return { kind: "AMOUNT_THRESHOLD", minAmount };
    }
    case "ACCOUNT_REFERENCE": {
      const value = asTrimmedString(record.value);
      const match = record.match;
      if (!value || (match !== "equals" && match !== "contains")) return null;
      return { kind: "ACCOUNT_REFERENCE", value, match };
    }
    case "PARSE_FAILURE":
      return { kind: "PARSE_FAILURE" };
    default:
      return null;
  }
}

/**
 * Parses a rule row into the conditions it represents. Legacy single-condition
 * rows become one-element lists; COMBO rows return their whole list. Unusable
 * entries are dropped (this is for display/editing — the engine is stricter).
 */
export function parseRuleConditions(type: string, condition: string): RuleCondition[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(condition);
  } catch {
    return [];
  }
  if (parsed == null || typeof parsed !== "object") return [];
  const record = parsed as Record<string, unknown>;

  switch (type) {
    case "COMBO": {
      if (!Array.isArray(record.conditions)) return [];
      return record.conditions
        .map(coerceCondition)
        .filter((item): item is RuleCondition => item != null);
    }
    case "SUPPLIER":
    case "SENDER_EMAIL":
    case "ACCOUNT_REFERENCE": {
      const coerced = coerceCondition({ ...record, kind: type });
      return coerced ? [coerced] : [];
    }
    case "AMOUNT_THRESHOLD": {
      const coerced = coerceCondition({ ...record, kind: "AMOUNT_THRESHOLD" });
      return coerced ? [coerced] : [];
    }
    case "PARSE_FAILURE":
      return record.parseFailure === true ? [{ kind: "PARSE_FAILURE" }] : [];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatCondition(condition: RuleCondition): string {
  switch (condition.kind) {
    case "SUPPLIER":
      return condition.supplierName
        ? `Supplier is ${condition.supplierName}`
        : "Supplier no longer exists";
    case "SENDER_EMAIL":
      if (condition.senderEmail) return `Supplier email is ${condition.senderEmail}`;
      return `Supplier domain is @${condition.senderDomain}`;
    case "AMOUNT_THRESHOLD":
      return `Total amount is greater than ${condition.minAmount.toLocaleString("en-AU")}`;
    case "ACCOUNT_REFERENCE":
      return condition.match === "equals"
        ? `Account reference is '${condition.value}'`
        : `Account reference contains '${condition.value}'`;
    case "PARSE_FAILURE":
      return "Invoice could not be parsed automatically";
  }
}

function joinConditionSummaries(summaries: string[]): string {
  return summaries
    .map((summary, index) =>
      index === 0 ? summary : summary.charAt(0).toLowerCase() + summary.slice(1),
    )
    .join(" and ");
}

export function formatRuleCondition(type: string, condition: string): string {
  if (type === "DEFAULT") return "Matches when no other rule applies";

  const conditions = parseRuleConditions(type, condition);
  if (conditions.length > 0) {
    return joinConditionSummaries(conditions.map(formatCondition));
  }

  switch (type) {
    case "SUPPLIER":
      return "No supplier selected";
    case "SENDER_EMAIL":
      return "No sender condition set";
    case "AMOUNT_THRESHOLD":
      return "No amount threshold set";
    case "ACCOUNT_REFERENCE":
      return "No account reference set";
    case "COMBO":
      return "No conditions set";
    case "PARSE_FAILURE":
      return "Invoice could not be parsed automatically";
    default:
      return condition;
  }
}

// ---------------------------------------------------------------------------
// Form <-> payload plumbing
// ---------------------------------------------------------------------------

/** One editable condition row in the rule form (all fields as input strings). */
export type ConditionRowFields = {
  kind: ConditionKind;
  supplierId: string;
  senderEmail: string;
  senderDomain: string;
  minAmount: string;
  accountValue: string;
  accountMatch: "equals" | "contains";
};

export const EMPTY_CONDITION_ROW_FIELDS: Omit<ConditionRowFields, "kind"> = {
  supplierId: "",
  senderEmail: "",
  senderDomain: "",
  minAmount: "",
  accountValue: "",
  accountMatch: "equals",
};

/** Loads a stored rule into editable rows (legacy rules become one row). */
export function conditionRowsFromRule(
  type: string,
  condition: string,
): ConditionRowFields[] {
  return parseRuleConditions(type, condition).map((parsed) => {
    const fields: ConditionRowFields = {
      ...EMPTY_CONDITION_ROW_FIELDS,
      kind: parsed.kind,
    };
    switch (parsed.kind) {
      case "SUPPLIER":
        fields.supplierId = parsed.supplierId;
        break;
      case "SENDER_EMAIL":
        fields.senderEmail = parsed.senderEmail ?? "";
        fields.senderDomain = parsed.senderDomain ?? "";
        break;
      case "AMOUNT_THRESHOLD":
        fields.minAmount = String(parsed.minAmount);
        break;
      case "ACCOUNT_REFERENCE":
        fields.accountValue = parsed.value;
        fields.accountMatch = parsed.match;
        break;
      case "PARSE_FAILURE":
        break;
    }
    return fields;
  });
}

export function conditionFromRowFields(
  row: ConditionRowFields,
  suppliers: Array<{ id: string; name: string }>,
): { condition: RuleCondition } | { error: string } {
  switch (row.kind) {
    case "SUPPLIER": {
      const supplierId = row.supplierId.trim();
      if (!supplierId) return { error: "Choose a supplier for the supplier condition." };
      const supplierName = suppliers.find((supplier) => supplier.id === supplierId)?.name;
      return { condition: { kind: "SUPPLIER", supplierId, supplierName } };
    }
    case "SENDER_EMAIL": {
      const senderEmail = row.senderEmail.trim();
      const senderDomain = row.senderDomain.trim();
      if (!senderEmail && !senderDomain) {
        return { error: "Enter a sender email or domain for the sender condition." };
      }
      return {
        condition: {
          kind: "SENDER_EMAIL",
          senderEmail: senderEmail || undefined,
          senderDomain: senderDomain || undefined,
        },
      };
    }
    case "AMOUNT_THRESHOLD": {
      const minAmount = Number(row.minAmount);
      if (!row.minAmount.trim() || Number.isNaN(minAmount)) {
        return { error: "Enter a valid minimum amount for the amount condition." };
      }
      return { condition: { kind: "AMOUNT_THRESHOLD", minAmount } };
    }
    case "ACCOUNT_REFERENCE": {
      const value = row.accountValue.trim();
      if (!value) {
        return { error: "Enter the account reference value to match." };
      }
      return {
        condition: { kind: "ACCOUNT_REFERENCE", value, match: row.accountMatch },
      };
    }
    case "PARSE_FAILURE":
      return { condition: { kind: "PARSE_FAILURE" } };
  }
}

/**
 * Turns the form's condition rows into the { type, condition } payload to
 * save. A single condition keeps its legacy rule type and bare condition shape
 * (so existing rows and any external consumers stay unchanged); account
 * reference has no legacy type, and multiple conditions become COMBO.
 */
export function buildRuleConditionsPayload(
  rows: ConditionRowFields[],
  suppliers: Array<{ id: string; name: string }>,
):
  | { type: RoutingRuleType; condition: Record<string, unknown> }
  | { error: string } {
  if (rows.length === 0) {
    return { error: "Add at least one condition." };
  }

  const conditions: RuleCondition[] = [];
  for (const row of rows) {
    const result = conditionFromRowFields(row, suppliers);
    if ("error" in result) return result;
    conditions.push(result.condition);
  }

  if (conditions.length === 1) {
    const [condition] = conditions;
    switch (condition.kind) {
      case "SUPPLIER":
        return {
          type: "SUPPLIER",
          condition: {
            supplierId: condition.supplierId,
            supplierName: condition.supplierName,
          },
        };
      case "SENDER_EMAIL":
        return {
          type: "SENDER_EMAIL",
          condition: {
            ...(condition.senderEmail ? { senderEmail: condition.senderEmail } : {}),
            ...(condition.senderDomain ? { senderDomain: condition.senderDomain } : {}),
          },
        };
      case "AMOUNT_THRESHOLD":
        return { type: "AMOUNT_THRESHOLD", condition: { minAmount: condition.minAmount } };
      case "PARSE_FAILURE":
        return { type: "PARSE_FAILURE", condition: { parseFailure: true } };
      case "ACCOUNT_REFERENCE":
        // No legacy single-condition type exists for account reference.
        return { type: "COMBO", condition: { conditions } };
    }
  }

  return { type: "COMBO", condition: { conditions } };
}
