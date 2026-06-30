import { db } from "@/lib/db";

export async function recordAuditEvent(params: {
  invoiceId?: string;
  userId?: string;
  action: string;
  details?: Record<string, unknown>;
}) {
  await db.auditEvent.create({
    data: {
      invoiceId: params.invoiceId,
      userId: params.userId,
      action: params.action,
      details: params.details ? JSON.stringify(params.details) : null,
    },
  });
}
