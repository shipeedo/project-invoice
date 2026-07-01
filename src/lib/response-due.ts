import { and, count, desc, eq } from "drizzle-orm";
import { addDays } from "@/lib/due-dates";
import {
  db,
  responseDueRules,
  type Invoice,
  type ResponseDueRule,
} from "@/lib/db";
import type { ResponseDueRuleAnchor } from "@/lib/db/types";

function getAnchorDate(
  invoice: Pick<Invoice, "dueDate" | "createdAt" | "validatedAt">,
  anchor: ResponseDueRuleAnchor,
): Date | null {
  switch (anchor) {
    case "INVOICE_DUE_DATE":
      return invoice.dueDate ?? null;
    case "RECEIVED_AT":
      return invoice.createdAt ?? null;
    case "VALIDATED_AT":
      return invoice.validatedAt ?? null;
    default:
      return null;
  }
}

export function computeResponseDueFromRule(
  invoice: Pick<Invoice, "dueDate" | "createdAt" | "validatedAt">,
  rule: Pick<ResponseDueRule, "anchor" | "offsetDays" | "direction">,
): Date | null {
  const anchorDate = getAnchorDate(invoice, rule.anchor);
  if (!anchorDate) return null;

  const signedOffset =
    rule.direction === "BEFORE" ? -rule.offsetDays : rule.offsetDays;
  return addDays(anchorDate, signedOffset);
}

export async function resolveResponseDueForInvoice(
  organizationId: string,
  invoice: Pick<Invoice, "dueDate" | "createdAt" | "validatedAt">,
): Promise<{ responseDueAt: Date; ruleId: string } | null> {
  const rules = await db.query.responseDueRules.findMany({
    where: and(
      eq(responseDueRules.organizationId, organizationId),
      eq(responseDueRules.enabled, true),
    ),
    orderBy: desc(responseDueRules.priority),
  });

  for (const rule of rules) {
    const responseDueAt = computeResponseDueFromRule(invoice, rule);
    if (responseDueAt) {
      return { responseDueAt, ruleId: rule.id };
    }
  }

  return null;
}

export async function ensureDefaultResponseDueRules(organizationId: string) {
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(responseDueRules)
    .where(eq(responseDueRules.organizationId, organizationId));

  if (existing > 0) return;

  await db.insert(responseDueRules).values([
    {
      organizationId,
      name: "7 days before invoice due date",
      priority: 100,
      anchor: "INVOICE_DUE_DATE",
      offsetDays: 7,
      direction: "BEFORE",
    },
    {
      organizationId,
      name: "3 days after received",
      priority: 50,
      anchor: "RECEIVED_AT",
      offsetDays: 3,
      direction: "AFTER",
    },
  ]);
}
