import { and, eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit";
import { addCreditDocuments, type CreditDocumentFile } from "@/lib/credit-documents";
import {
  buildCreditRequestLineItems,
  computeGstCreditAmount,
  isCreditRequestOpen,
  parseCreditRequestLineItems,
  sumRequestedAmounts,
  type CreateCreditLineInput,
} from "@/lib/credit-line-utils";
import { creditRequests, db, invoices } from "@/lib/db";
import type { CreditRequestStatus } from "@/lib/db/types";

export type {
  CreateCreditLineInput,
  CreditRequestLineItem,
} from "@/lib/credit-line-utils";
export {
  computeGstCreditAmount,
  isCreditRequestOpen,
  parseCreateCreditLinesInput,
  parseCreditRequestLineItems,
  sumRequestedAmounts,
} from "@/lib/credit-line-utils";

export async function createCreditRequest(params: {
  organizationId: string;
  userId: string;
  invoiceId: string;
  lines: CreateCreditLineInput[];
  includeGst?: boolean;
  requestedTotal?: number | null;
  notes?: string | null;
}) {
  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, params.invoiceId),
      eq(invoices.organizationId, params.organizationId),
    ),
  });

  if (!invoice) {
    return { error: "Invoice not found" as const };
  }

  const creditLines = buildCreditRequestLineItems(params.lines);
  if (creditLines.length === 0) {
    return { error: "At least one credit line is required" as const };
  }

  // GST is recomputed here from the entered lines rather than trusted from
  // the client.
  const subtotal = sumRequestedAmounts(creditLines);
  const gstAmount = params.includeGst ? computeGstCreditAmount(subtotal) : null;
  const computedTotal = subtotal + (gstAmount ?? 0);
  const requestedTotal =
    params.requestedTotal != null && Number.isFinite(params.requestedTotal)
      ? params.requestedTotal
      : computedTotal;

  const notes = params.notes?.trim() || null;
  const subject = `Credit request — ${invoice.invoiceNumber ?? invoice.vendorName ?? "Invoice"} — ${creditLines.length} line${creditLines.length === 1 ? "" : "s"}`;
  const recipientEmail = invoice.vendorEmail ?? invoice.emailFrom ?? "";
  const message =
    notes ??
    `Credit requested for ${creditLines.length} line item${creditLines.length === 1 ? "" : "s"}.`;

  const [creditRequest] = await db
    .insert(creditRequests)
    .values({
      organizationId: params.organizationId,
      invoiceId: params.invoiceId,
      createdById: params.userId,
      status: "DRAFT",
      subject,
      recipientEmail,
      message,
      lineItems: JSON.stringify(creditLines),
      requestedTotal,
      gstAmount,
      notes,
    })
    .returning();

  await recordAuditEvent({
    invoiceId: params.invoiceId,
    userId: params.userId,
    action: "credit_request.created",
    details: {
      creditRequestId: creditRequest.id,
      lineCount: creditLines.length,
      requestedTotal,
      gstAmount,
    },
  });

  return { creditRequest };
}

export async function recordCreditRequestOutcome(params: {
  organizationId: string;
  userId: string;
  creditRequestId: string;
  outcome: "approved" | "denied";
  approvedAmount?: number | null;
  /** Credit note files already saved to uploads; mirrored into invoice documents. */
  attachments?: CreditDocumentFile[];
  note?: string | null;
}) {
  const request = await db.query.creditRequests.findFirst({
    where: and(
      eq(creditRequests.id, params.creditRequestId),
      eq(creditRequests.organizationId, params.organizationId),
    ),
  });

  if (!request) {
    return { error: "Credit request not found" as const };
  }

  if (!isCreditRequestOpen(request.status)) {
    return { error: "Credit request is already closed" as const };
  }

  const creditLines = parseCreditRequestLineItems(request.lineItems);
  const defaultAmount = request.requestedTotal ?? sumRequestedAmounts(creditLines);
  let approvedAmount: number | null = null;
  let status: CreditRequestStatus;
  let carrierDecision: "APPROVED" | "DENIED" | null = null;

  if (params.outcome === "approved") {
    approvedAmount =
      params.approvedAmount != null && Number.isFinite(params.approvedAmount)
        ? params.approvedAmount
        : defaultAmount;
    if (approvedAmount == null || approvedAmount <= 0) {
      return { error: "Approved amount is required" as const };
    }
    status = "APPROVED";
    carrierDecision = "APPROVED";
  } else {
    status = "REJECTED";
    carrierDecision = "DENIED";
  }

  const [updated] = await db
    .update(creditRequests)
    .set({
      status,
      carrierDecision,
      approvedAmount,
      updatedAt: new Date(),
    })
    .where(eq(creditRequests.id, request.id))
    .returning();

  const attachments = params.attachments ?? [];
  if (attachments.length > 0 || params.note?.trim()) {
    await addCreditDocuments({
      organizationId: params.organizationId,
      invoiceId: request.invoiceId,
      creditRequestId: request.id,
      uploadedById: params.userId,
      files: attachments,
      note: params.note,
    });
  }

  await recordAuditEvent({
    invoiceId: request.invoiceId,
    userId: params.userId,
    action: "credit_request.updated",
    details: {
      creditRequestId: request.id,
      status,
      carrierDecision,
      approvedAmount,
      ...(attachments.length > 0
        ? { fileNames: attachments.map((file) => file.fileName) }
        : {}),
    },
  });

  return { creditRequest: updated };
}
