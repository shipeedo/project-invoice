import { db, auditEvents } from "@/lib/db";

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
