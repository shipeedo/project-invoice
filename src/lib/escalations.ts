import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit";
import { db, escalationRules, invoices } from "@/lib/db";
import {
  ACTIONABLE_STATUSES,
  addBusinessDays,
  startOfDay,
} from "@/lib/invoice-deadlines";

export type EscalationRuleLike = {
  id: string;
  watchedUserId: string | null;
  afterBusinessDays: number;
  escalateToId: string | null;
  enabled: boolean;
};

export type EscalationCandidate = {
  assignedToId: string | null;
  assignedAt: Date | null;
  validatedAt?: Date | null;
  createdAt: Date;
};

/**
 * Picks the escalation rule that fires for an invoice, if any. Rules watching
 * the invoice's current assignee beat catch-all rules; within the same
 * specificity the shortest window wins. A rule never fires when it would
 * reassign the invoice to the person who already has it.
 */
export function resolveEscalation(
  invoice: EscalationCandidate,
  rules: EscalationRuleLike[],
  now = new Date(),
): EscalationRuleLike | null {
  if (!invoice.assignedToId) return null;

  const anchor = invoice.assignedAt ?? invoice.validatedAt ?? invoice.createdAt;
  if (!anchor) return null;

  const applicable = rules
    .filter(
      (rule) =>
        rule.enabled &&
        rule.escalateToId != null &&
        rule.escalateToId !== invoice.assignedToId &&
        (rule.watchedUserId == null ||
          rule.watchedUserId === invoice.assignedToId),
    )
    .sort((a, b) => {
      const aSpecific = a.watchedUserId != null ? 0 : 1;
      const bSpecific = b.watchedUserId != null ? 0 : 1;
      if (aSpecific !== bSpecific) return aSpecific - bSpecific;
      return a.afterBusinessDays - b.afterBusinessDays;
    });

  const today = startOfDay(now);
  for (const rule of applicable) {
    const deadline = addBusinessDays(anchor, rule.afterBusinessDays);
    if (today >= deadline) return rule;
  }

  return null;
}

export type EscalationRunResult = {
  checked: number;
  escalated: number;
  reassignments: Array<{
    invoiceId: string;
    fromUserId: string;
    toUserId: string;
    ruleId: string;
  }>;
};

/**
 * Reassigns invoices that have sat with an assignee beyond an escalation
 * rule's window. Run from the escalations cron. Reassignment resets the
 * assignment clock, so a chain of rules keeps moving an untouched invoice.
 */
export async function runEscalations(now = new Date()): Promise<EscalationRunResult> {
  const rules = await db.query.escalationRules.findMany({
    where: eq(escalationRules.enabled, true),
  });

  const result: EscalationRunResult = {
    checked: 0,
    escalated: 0,
    reassignments: [],
  };

  if (rules.length === 0) return result;

  const rulesByOrg = new Map<string, typeof rules>();
  for (const rule of rules) {
    const existing = rulesByOrg.get(rule.organizationId) ?? [];
    existing.push(rule);
    rulesByOrg.set(rule.organizationId, existing);
  }

  for (const [organizationId, orgRules] of rulesByOrg) {
    const candidates = await db.query.invoices.findMany({
      where: and(
        eq(invoices.organizationId, organizationId),
        inArray(invoices.status, [...ACTIONABLE_STATUSES]),
        isNotNull(invoices.assignedToId),
        isNull(invoices.deletedAt),
      ),
    });

    result.checked += candidates.length;

    for (const invoice of candidates) {
      const rule = resolveEscalation(invoice, orgRules, now);
      if (!rule?.escalateToId || !invoice.assignedToId) continue;

      await db
        .update(invoices)
        .set({
          assignedToId: rule.escalateToId,
          assignedAt: now,
          updatedAt: now,
        })
        .where(eq(invoices.id, invoice.id));

      await recordAuditEvent({
        invoiceId: invoice.id,
        action: "invoice.escalated",
        details: {
          ruleId: rule.id,
          fromUserId: invoice.assignedToId,
          toUserId: rule.escalateToId,
          afterBusinessDays: rule.afterBusinessDays,
        },
      });

      result.escalated += 1;
      result.reassignments.push({
        invoiceId: invoice.id,
        fromUserId: invoice.assignedToId,
        toUserId: rule.escalateToId,
        ruleId: rule.id,
      });
    }
  }

  return result;
}
