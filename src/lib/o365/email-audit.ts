import { and, eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit";
import { db, processedO365Messages } from "@/lib/db";

export type EmailIgnoreReason =
  | "already_processed"
  | "no_invoice_detected"
  | "account_statement"
  | "duplicate_invoice"
  | "outbound_message";

export async function recordEmailProcessingOutcome(params: {
  organizationId: string;
  messageId: string;
  subject?: string | null;
  fromEmail?: string | null;
  outcome: "created" | "ignored";
  ignoreReason?: EmailIgnoreReason | string | null;
  note?: string | null;
  invoiceId?: string | null;
  duplicateInvoiceId?: string | null;
  triggeredBy?: "sync" | "manual" | "background";
}) {
  const existing = await db.query.processedO365Messages.findFirst({
    where: and(
      eq(processedO365Messages.organizationId, params.organizationId),
      eq(processedO365Messages.messageId, params.messageId),
    ),
  });

  if (existing) {
    return existing;
  }

  const ignoreReason =
    params.outcome === "ignored" ? (params.ignoreReason ?? "ignored") : null;

  const [record] = await db
    .insert(processedO365Messages)
    .values({
      organizationId: params.organizationId,
      messageId: params.messageId,
      invoiceId: params.invoiceId ?? null,
      ignoreReason,
      processedAt: new Date(),
    })
    .returning();

  const action =
    params.outcome === "created" ? "email.invoice_created" : "email.ignored";

  await recordAuditEvent({
    invoiceId: params.invoiceId ?? params.duplicateInvoiceId ?? undefined,
    action,
    details: {
      messageId: params.messageId,
      subject: params.subject,
      fromEmail: params.fromEmail,
      ignoreReason,
      note: params.note ?? undefined,
      duplicateInvoiceId: params.duplicateInvoiceId,
      triggeredBy: params.triggeredBy ?? "sync",
    },
  });

  return record;
}
