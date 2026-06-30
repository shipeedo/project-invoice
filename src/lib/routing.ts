import { and, count, desc, eq } from "drizzle-orm";
import { db, routingRules, users, type Invoice, type RoutingRule, type User } from "@/lib/db";

type RuleCondition =
  | { senderEmail?: string; senderDomain?: string }
  | { minAmount?: number }
  | { parseFailure?: boolean }
  | Record<string, never>;

function parseCondition(condition: string): RuleCondition {
  try {
    return JSON.parse(condition) as RuleCondition;
  } catch {
    return {};
  }
}

function matchesSenderRule(rule: RoutingRule, invoice: Invoice): boolean {
  const condition = parseCondition(rule.condition) as {
    senderEmail?: string;
    senderDomain?: string;
  };

  if (condition.senderEmail && invoice.vendorEmail) {
    return invoice.vendorEmail.toLowerCase() === condition.senderEmail.toLowerCase();
  }

  if (condition.senderDomain && invoice.vendorEmail) {
    const domain = invoice.vendorEmail.split("@")[1]?.toLowerCase();
    return domain === condition.senderDomain.toLowerCase();
  }

  return false;
}

function matchesAmountRule(rule: RoutingRule, invoice: Invoice): boolean {
  const condition = parseCondition(rule.condition) as { minAmount?: number };
  if (condition.minAmount == null || invoice.totalAmount == null) {
    return false;
  }
  return invoice.totalAmount > condition.minAmount;
}

function matchesParseFailureRule(rule: RoutingRule, invoice: Invoice): boolean {
  const condition = parseCondition(rule.condition) as { parseFailure?: boolean };
  return Boolean(condition.parseFailure && invoice.parseError);
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

    let matches = false;
    switch (rule.type) {
      case "SENDER_EMAIL":
        matches = matchesSenderRule(rule, invoice);
        break;
      case "AMOUNT_THRESHOLD":
        matches = matchesAmountRule(rule, invoice);
        break;
      case "PARSE_FAILURE":
        matches = matchesParseFailureRule(rule, invoice);
        break;
      default:
        break;
    }

    if (matches && rule.approver) {
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
