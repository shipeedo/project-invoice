import { and, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit";
import { daysBetween } from "@/lib/due-dates";
import { db, escalationRules, invoices, users, type Invoice } from "@/lib/db";

const ESCALATABLE_STATUSES = ["PENDING_APPROVAL", "NEEDS_REVIEW"] as const;

export async function ensureDefaultEscalationRule(organizationId: string) {
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(escalationRules)
    .where(eq(escalationRules.organizationId, organizationId));

  if (existing > 0) return;

  const admin = await db.query.users.findFirst({
    where: and(eq(users.organizationId, organizationId), eq(users.role, "ADMIN")),
  });

  const escalateTo =
    admin ??
    (await db.query.users.findFirst({
      where: eq(users.organizationId, organizationId),
    }));

  if (!escalateTo) return;

  await db.insert(escalationRules).values({
    organizationId,
    name: "Escalate after 5 days without action",
    priority: 10,
    daysWithoutAction: 5,
    escalateToUserId: escalateTo.id,
  });
}

function getIdleSince(invoice: Invoice): Date | null {
  return invoice.assignedAt ?? invoice.validatedAt ?? invoice.createdAt ?? null;
}

export async function processEscalationsForOrganization(organizationId: string) {
  const rules = await db.query.escalationRules.findMany({
    where: and(
      eq(escalationRules.organizationId, organizationId),
      eq(escalationRules.enabled, true),
    ),
    orderBy: desc(escalationRules.priority),
    with: {
      escalateTo: { columns: { id: true, name: true, email: true } },
    },
  });

  if (rules.length === 0) return { escalated: 0 };

  const candidates = await db.query.invoices.findMany({
    where: and(
      eq(invoices.organizationId, organizationId),
      inArray(invoices.status, [...ESCALATABLE_STATUSES]),
      isNotNull(invoices.assignedToId),
    ),
  });

  const now = new Date();
  let escalated = 0;

  for (const invoice of candidates) {
    const idleSince = getIdleSince(invoice);
    if (!idleSince || !invoice.assignedToId) continue;

    const idleDays = daysBetween(idleSince, now);
    const rule = rules.find((candidate) => idleDays >= candidate.daysWithoutAction);
    if (!rule?.escalateTo) continue;

    if (invoice.assignedToId === rule.escalateTo.id) continue;

    await db
      .update(invoices)
      .set({
        assignedToId: rule.escalateTo.id,
        assignedAt: now,
        escalatedAt: now,
        escalationLevel: invoice.escalationLevel + 1,
        updatedAt: now,
      })
      .where(eq(invoices.id, invoice.id));

    await recordAuditEvent({
      invoiceId: invoice.id,
      action: "invoice.escalated",
      details: {
        ruleId: rule.id,
        ruleName: rule.name,
        idleDays,
        fromUserId: invoice.assignedToId,
        toUserId: rule.escalateTo.id,
        toUserEmail: rule.escalateTo.email,
        escalationLevel: invoice.escalationLevel + 1,
      },
    });

    escalated += 1;
  }

  return { escalated };
}

export async function processAllEscalations() {
  const orgs = await db.query.organizations.findMany({
    columns: { id: true },
  });

  let totalEscalated = 0;
  for (const org of orgs) {
    const result = await processEscalationsForOrganization(org.id);
    totalEscalated += result.escalated;
  }

  return { escalated: totalEscalated };
}
