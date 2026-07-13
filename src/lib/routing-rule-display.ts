import type { RoutingRuleType } from "@/lib/db/types";

type RuleCondition =
  | { supplierId?: string; supplierName?: string }
  | { senderEmail?: string; senderDomain?: string }
  | { minAmount?: number }
  | { parseFailure?: boolean }
  | Record<string, never>;

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
  DEFAULT: {
    label: "Default (catch-all)",
    description:
      "Assigns any invoice that does not match a higher-priority rule. Every organisation needs exactly one default rule.",
    example:
      'e.g. "General inbox" — all routine invoices that pass other checks land here.',
  },
};

export function parseRuleCondition(condition: string): RuleCondition {
  try {
    return JSON.parse(condition) as RuleCondition;
  } catch {
    return {};
  }
}

export function formatRuleType(type: string): string {
  return RULE_TYPE_INFO[type as RoutingRuleType]?.label ?? type;
}

export function formatRuleCondition(type: string, condition: string): string {
  const parsed = parseRuleCondition(condition);

  switch (type) {
    case "SUPPLIER": {
      const c = parsed as { supplierId?: string; supplierName?: string };
      if (c.supplierName) return `Supplier is ${c.supplierName}`;
      return c.supplierId ? "Supplier no longer exists" : "No supplier selected";
    }
    case "SENDER_EMAIL": {
      const c = parsed as { senderEmail?: string; senderDomain?: string };
      if (c.senderEmail) return `Supplier email is ${c.senderEmail}`;
      if (c.senderDomain) return `Supplier domain is @${c.senderDomain}`;
      return "No sender condition set";
    }
    case "AMOUNT_THRESHOLD": {
      const c = parsed as { minAmount?: number };
      if (c.minAmount == null || Number.isNaN(c.minAmount)) {
        return "No amount threshold set";
      }
      return `Total amount is greater than ${c.minAmount.toLocaleString("en-AU")}`;
    }
    case "PARSE_FAILURE":
      return "Invoice could not be parsed automatically";
    case "DEFAULT":
      return "Matches when no other rule applies";
    default:
      return condition;
  }
}

export function buildRuleCondition(
  type: RoutingRuleType,
  fields: {
    supplierId?: string;
    supplierName?: string;
    senderEmail?: string;
    senderDomain?: string;
    minAmount?: string;
  },
): { condition: Record<string, unknown>; error?: string } {
  if (type === "SUPPLIER") {
    const supplierId = fields.supplierId?.trim() ?? "";
    if (!supplierId) {
      return { condition: {}, error: "Choose a supplier for this rule." };
    }
    // The name is a display snapshot; matching uses only the id.
    return {
      condition: { supplierId, supplierName: fields.supplierName?.trim() || undefined },
    };
  }

  if (type === "SENDER_EMAIL") {
    const senderEmail = fields.senderEmail?.trim() ?? "";
    const senderDomain = fields.senderDomain?.trim() ?? "";
    if (!senderEmail && !senderDomain) {
      return {
        condition: {},
        error: "Enter a sender email or domain for this rule type.",
      };
    }
    const condition: Record<string, unknown> = {};
    if (senderEmail) condition.senderEmail = senderEmail;
    if (senderDomain) condition.senderDomain = senderDomain;
    return { condition };
  }

  if (type === "AMOUNT_THRESHOLD") {
    const minAmount = Number(fields.minAmount);
    if (!fields.minAmount?.trim() || Number.isNaN(minAmount)) {
      return {
        condition: {},
        error: "Enter a valid minimum amount for this rule type.",
      };
    }
    return { condition: { minAmount } };
  }

  if (type === "PARSE_FAILURE") {
    return { condition: { parseFailure: true } };
  }

  return { condition: {} };
}

export function conditionFieldsFromRule(
  type: RoutingRuleType,
  condition: string,
): { supplierId: string; senderEmail: string; senderDomain: string; minAmount: string } {
  const parsed = parseRuleCondition(condition);
  const fields = { supplierId: "", senderEmail: "", senderDomain: "", minAmount: "" };

  if (type === "SUPPLIER") {
    const c = parsed as { supplierId?: string };
    fields.supplierId = c.supplierId ?? "";
  } else if (type === "SENDER_EMAIL") {
    const c = parsed as { senderEmail?: string; senderDomain?: string };
    fields.senderEmail = c.senderEmail ?? "";
    fields.senderDomain = c.senderDomain ?? "";
  } else if (type === "AMOUNT_THRESHOLD") {
    const c = parsed as { minAmount?: number };
    fields.minAmount = c.minAmount != null ? String(c.minAmount) : "";
  }

  return fields;
}
