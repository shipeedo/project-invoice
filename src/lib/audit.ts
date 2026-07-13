import { and, eq, gt } from "drizzle-orm";
import { db, auditEvents } from "@/lib/db";

// Server actions call router.refresh(), which re-renders the invoice page and
// would otherwise log a "viewed" event after every click. Views by the same
// user inside this window are treated as one.
export const VIEW_DEDUPE_WINDOW_MS = 15 * 60 * 1000;

export async function recordInvoiceView(params: {
  invoiceId: string;
  userId: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const windowStart = new Date(now.getTime() - VIEW_DEDUPE_WINDOW_MS);
  const recentView = await db.query.auditEvents.findFirst({
    where: and(
      eq(auditEvents.invoiceId, params.invoiceId),
      eq(auditEvents.userId, params.userId),
      eq(auditEvents.action, "invoice.viewed"),
      gt(auditEvents.createdAt, windowStart),
    ),
    columns: { id: true },
  });
  if (recentView) return;

  await recordAuditEvent({
    invoiceId: params.invoiceId,
    userId: params.userId,
    action: "invoice.viewed",
  });
}

export async function recordAuditEvent(params: {
  invoiceId?: string;
  userId?: string;
  action: string;
  details?: Record<string, unknown>;
}) {
  await db.insert(auditEvents).values({
    invoiceId: params.invoiceId,
    userId: params.userId,
    action: params.action,
    details: params.details ? JSON.stringify(params.details) : null,
  });
}
