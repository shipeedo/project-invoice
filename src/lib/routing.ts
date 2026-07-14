import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, routingRules, users, type Invoice, type User } from "@/lib/db";

// ---------------------------------------------------------------------------
// Rule conditions
//
// Every routing rule evaluates to a list of conditions that must ALL match
// (AND semantics). Legacy rows store a single bare condition object and get
// normalized into a one-element list at match time; COMBO rows store
// `{ conditions: RuleCondition[] }` directly.
// ---------------------------------------------------------------------------

export type RuleCondition =
  | { kind: "SUPPLIER"; supplierId: string; supplierName?: string }
  | { kind: "SENDER_EMAIL"; senderEmail?: string; senderDomain?: string }
  | { kind: "AMOUNT_THRESHOLD"; minAmount: number }
  | { kind: "ACCOUNT_REFERENCE"; value: string; match: "equals" | "contains" }
  | { kind: "PARSE_FAILURE" };

const supplierConditionSchema = z.object({
  kind: z.literal("SUPPLIER"),
  supplierId: z.string().min(1, "Choose a supplier for the supplier condition."),
  supplierName: z.string().optional(),
});

const senderEmailConditionSchema = z
  .object({
    kind: z.literal("SENDER_EMAIL"),
    senderEmail: z.string().optional(),
    senderDomain: z.string().optional(),
  })
  .refine((value) => Boolean(value.senderEmail?.trim() || value.senderDomain?.trim()), {
    message: "A sender condition needs an email address or a domain.",
  });

const amountConditionSchema = z.object({
  kind: z.literal("AMOUNT_THRESHOLD"),
  minAmount: z.number().finite(),
});

const accountReferenceConditionSchema = z.object({
  kind: z.literal("ACCOUNT_REFERENCE"),
  value: z
    .string()
    .trim()
    .min(1, "An account reference condition needs a value to match."),
  match: z.enum(["equals", "contains"]),
});

const parseFailureConditionSchema = z.object({
  kind: z.literal("PARSE_FAILURE"),
});

export const ruleConditionSchema = z.discriminatedUnion("kind", [
  supplierConditionSchema,
  senderEmailConditionSchema,
  amountConditionSchema,
  accountReferenceConditionSchema,
  parseFailureConditionSchema,
]);

const comboConditionSchema = z.object({
  conditions: z
    .array(ruleConditionSchema)
    .min(1, "A combined rule needs at least one condition."),
});

// Legacy single-condition payload shapes, keyed by rule type. These match what
// existing rows store and what the UI keeps writing for one-condition rules.
const legacyConditionSchemas = {
  SUPPLIER: z.object({
    supplierId: z.string().min(1, "Choose a supplier for this rule."),
    supplierName: z.string().optional(),
  }),
  SENDER_EMAIL: z
    .object({
      senderEmail: z.string().optional(),
      senderDomain: z.string().optional(),
    })
    .refine(
      (value) => Boolean(value.senderEmail?.trim() || value.senderDomain?.trim()),
      { message: "Enter a sender email or domain for this rule type." },
    ),
  AMOUNT_THRESHOLD: z.object({
    minAmount: z.number().finite(),
  }),
  PARSE_FAILURE: z
    .object({ parseFailure: z.literal(true).optional() })
    .transform(() => ({ parseFailure: true as const })),
} as const;

export type ValidatedRuleCondition =
  | { ok: true; condition: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Validates a rule's condition payload against its type and returns the
 * sanitized condition object to persist. Rejects unknown types, unknown
 * condition kinds, empty COMBO lists, and empty account-reference values.
 */
export function validateRuleConditionInput(
  type: string,
  condition: unknown,
): ValidatedRuleCondition {
  if (type === "DEFAULT") {
    return { ok: true, condition: {} };
  }

  if (type === "COMBO") {
    const parsed = comboConditionSchema.safeParse(condition);
    if (!parsed.success) {
      return { ok: false, error: firstZodError(parsed.error) };
    }
    return { ok: true, condition: parsed.data };
  }

  const schema = legacyConditionSchemas[type as keyof typeof legacyConditionSchemas];
  if (!schema) {
    return { ok: false, error: `Unknown rule type "${type}".` };
  }

  const parsed = schema.safeParse(condition);
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }
  return { ok: true, condition: parsed.data };
}

function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid rule condition.";
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** The subset of invoice fields routing conditions can look at. */
export type RoutingInvoice = Pick<
  Invoice,
  "supplierId" | "vendorEmail" | "totalAmount" | "parseError" | "accountReference"
>;

/**
 * Normalizes a rule row into the list of conditions that must all match.
 * Returns null when the stored condition is unusable (bad JSON, empty COMBO,
 * unknown kinds) so the rule simply never matches instead of throwing.
 */
export function normalizeRuleConditions(
  rule: { type: string; condition: string },
): RuleCondition[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rule.condition);
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;

  switch (rule.type) {
    case "COMBO": {
      if (!Array.isArray(record.conditions) || record.conditions.length === 0) {
        return null;
      }
      const conditions: RuleCondition[] = [];
      for (const raw of record.conditions) {
        const condition = ruleConditionSchema.safeParse(raw);
        // A COMBO with any unusable member must not match: dropping the member
        // would silently loosen the rule.
        if (!condition.success) return null;
        conditions.push(condition.data);
      }
      return conditions;
    }
    case "SUPPLIER": {
      const parsedLegacy = legacyConditionSchemas.SUPPLIER.safeParse(record);
      if (!parsedLegacy.success) return null;
      return [{ kind: "SUPPLIER", ...parsedLegacy.data }];
    }
    case "SENDER_EMAIL": {
      const parsedLegacy = legacyConditionSchemas.SENDER_EMAIL.safeParse(record);
      if (!parsedLegacy.success) return null;
      return [{ kind: "SENDER_EMAIL", ...parsedLegacy.data }];
    }
    case "AMOUNT_THRESHOLD": {
      const parsedLegacy = legacyConditionSchemas.AMOUNT_THRESHOLD.safeParse(record);
      if (!parsedLegacy.success) return null;
      return [{ kind: "AMOUNT_THRESHOLD", ...parsedLegacy.data }];
    }
    case "PARSE_FAILURE": {
      // Legacy rows store { parseFailure: true }.
      if (record.parseFailure !== true) return null;
      return [{ kind: "PARSE_FAILURE" }];
    }
    default:
      return null;
  }
}

export function matchesRuleCondition(
  condition: RuleCondition,
  invoice: RoutingInvoice,
): boolean {
  switch (condition.kind) {
    case "SUPPLIER":
      return invoice.supplierId != null && invoice.supplierId === condition.supplierId;
    case "SENDER_EMAIL": {
      if (!invoice.vendorEmail) return false;
      if (condition.senderEmail) {
        return invoice.vendorEmail.toLowerCase() === condition.senderEmail.toLowerCase();
      }
      if (condition.senderDomain) {
        const domain = invoice.vendorEmail.split("@")[1]?.toLowerCase();
        return domain === condition.senderDomain.toLowerCase();
      }
      return false;
    }
    case "AMOUNT_THRESHOLD":
      return invoice.totalAmount != null && invoice.totalAmount > condition.minAmount;
    case "ACCOUNT_REFERENCE": {
      // Case-insensitive, trimmed. Invoices without an extracted account
      // reference never match, whatever the operator.
      const reference = invoice.accountReference?.trim().toLowerCase();
      if (!reference) return false;
      const value = condition.value.trim().toLowerCase();
      if (!value) return false;
      return condition.match === "equals"
        ? reference === value
        : reference.includes(value);
    }
    case "PARSE_FAILURE":
      return Boolean(invoice.parseError);
  }
}

/** True when every condition of the rule matches the invoice (AND). */
export function ruleMatchesInvoice(
  rule: { type: string; condition: string },
  invoice: RoutingInvoice,
): boolean {
  const conditions = normalizeRuleConditions(rule);
  if (!conditions || conditions.length === 0) return false;
  return conditions.every((condition) => matchesRuleCondition(condition, invoice));
}

export async function assignApproverForInvoice(
  organizationId: string,
  invoice: Invoice,
): Promise<User | null> {
  const rules = await db.query.routingRules.findMany({
    where: and(
      eq(routingRules.organizationId, organizationId),
      eq(routingRules.enabled, true),
    ),
    orderBy: desc(routingRules.priority),
    with: { approver: true },
  });

  for (const rule of rules) {
    if (rule.isDefault) continue;
    if (ruleMatchesInvoice(rule, invoice) && rule.approver) {
      return rule.approver;
    }
  }

  const defaultRule = rules.find((rule) => rule.isDefault);
  return defaultRule?.approver ?? null;
}

export async function ensureDefaultRoutingRules(organizationId: string) {
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(routingRules)
    .where(eq(routingRules.organizationId, organizationId));

  if (existing > 0) return;

  const admin = await db.query.users.findFirst({
    where: and(eq(users.organizationId, organizationId), eq(users.role, "ADMIN")),
  });

  const approver =
    admin ??
    (await db.query.users.findFirst({
      where: eq(users.organizationId, organizationId),
    }));

  if (!approver) return;

  await db.insert(routingRules).values([
    {
      organizationId,
      name: "High value invoices",
      priority: 100,
      type: "AMOUNT_THRESHOLD",
      condition: JSON.stringify({ minAmount: 100000 }),
      approverId: approver.id,
    },
    {
      organizationId,
      name: "Parse failures",
      priority: 50,
      type: "PARSE_FAILURE",
      condition: JSON.stringify({ parseFailure: true }),
      approverId: approver.id,
    },
    {
      organizationId,
      name: "Default approver",
      priority: 0,
      type: "DEFAULT",
      condition: "{}",
      approverId: approver.id,
      isDefault: true,
    },
  ]);
}
