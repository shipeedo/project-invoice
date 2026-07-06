import { and, eq, inArray } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit";
import {
  applyCreditOutcomeToLines,
  buildCreditRequestLineItems,
  computeFuelCreditAmount,
  computeGstCreditAmount,
  isCreditRequestOpen,
  markLinesCreditPending,
  OPEN_CREDIT_STATUSES,
  parseCreditRequestLineItems,
  sumRequestedAmounts,
  type CreateCreditLineInput,
} from "@/lib/credit-line-utils";
import { creditRequests, db, invoices } from "@/lib/db";
import type { CreditRequestStatus } from "@/lib/db/types";
import { parseLineItems } from "@/lib/line-items";

export type {
  CreateCreditLineInput,
  CreditRequestLineItem,
} from "@/lib/credit-line-utils";
export {
  applyCreditOutcomeToLines,
  canRequestCreditForLine,
  computeFuelCreditAmount,
  computeGstCreditAmount,
  computeInvoiceFuelRate,
  parseFuelRatePercent,
  isCreditRequestOpen,
  markLinesCreditPending,
  parseCreateCreditLinesInput,
  parseCreditRequestLineItems,
  sumRequestedAmounts,
} from "@/lib/credit-line-utils";
export { buildCreditSubmissionCsv } from "@/lib/credit-submission-export";

export async function createCreditRequestFromLines(params: {
  organizationId: string;
  userId: string;
  invoiceId: string;
  lines: CreateCreditLineInput[];
  includeFuel?: boolean;
  /** User-supplied fuel levy fraction; falls back to the invoice-derived rate. */
  fuelRate?: number | null;
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

  const invoiceLines = parseLineItems(invoice.lineItems);
  const creditLines = buildCreditRequestLineItems(invoiceLines, params.lines);
  if (!creditLines || creditLines.length === 0) {
    return { error: "Invalid line selection for credit request" as const };
  }

  const openRequests = await db.query.creditRequests.findMany({
    where: and(
      eq(creditRequests.invoiceId, params.invoiceId),
      eq(creditRequests.organizationId, params.organizationId),
      inArray(creditRequests.status, OPEN_CREDIT_STATUSES),
    ),
  });

  const blockedIndices = new Set<number>();
  for (const request of openRequests) {
    for (const line of parseCreditRequestLineItems(request.lineItems)) {
      blockedIndices.add(line.lineIndex);
    }
  }

  if (creditLines.some((line) => blockedIndices.has(line.lineIndex))) {
    return { error: "One or more selected lines already have an open credit request" as const };
  }

  // Fuel and GST are recomputed here from the invoice lines rather than
  // trusted from the client.
  const fuelAmount = params.includeFuel
    ? computeFuelCreditAmount(invoiceLines, creditLines, params.fuelRate)
    : null;
  const subtotal = sumRequestedAmounts(creditLines);
  const gstAmount = params.includeGst
    ? computeGstCreditAmount(subtotal + (fuelAmount ?? 0))
    : null;
  const computedTotal = subtotal + (fuelAmount ?? 0) + (gstAmount ?? 0);
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

  const outcome = db.transaction((tx) => {
    const [creditRequest] = tx
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
        fuelAmount,
        gstAmount,
        notes,
      })
      .returning()
      .all();

    const nextLines = markLinesCreditPending(invoiceLines, creditLines, creditRequest.id);
    tx.update(invoices)
      .set({
        lineItems: JSON.stringify(nextLines),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, params.invoiceId))
      .run();

    return creditRequest;
  });

  await recordAuditEvent({
    invoiceId: params.invoiceId,
    userId: params.userId,
    action: "credit_request.created",
    details: {
      creditRequestId: outcome.id,
      lineCount: creditLines.length,
      requestedTotal,
      fuelAmount,
      gstAmount,
    },
  });

  return { creditRequest: outcome };
}

export async function recordCreditRequestOutcome(params: {
  organizationId: string;
  userId: string;
  creditRequestId: string;
  outcome: "approved" | "denied";
  approvedAmount?: number | null;
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
  if (creditLines.length === 0) {
    return { error: "Credit request has no linked line items" as const };
  }

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, request.invoiceId),
      eq(invoices.organizationId, params.organizationId),
    ),
  });

  if (!invoice) {
    return { error: "Invoice not found" as const };
  }

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

  const invoiceLines = parseLineItems(invoice.lineItems);
  const nextLines = applyCreditOutcomeToLines(
    invoiceLines,
    creditLines,
    params.outcome === "approved" ? "APPROVED" : "DENIED",
  );

  const updated = db.transaction((tx) => {
    tx.update(invoices)
      .set({
        lineItems: JSON.stringify(nextLines),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id))
      .run();

    return tx
      .update(creditRequests)
      .set({
        status,
        carrierDecision,
        approvedAmount,
        updatedAt: new Date(),
      })
      .where(eq(creditRequests.id, request.id))
      .returning()
      .get();
  });

  await recordAuditEvent({
    invoiceId: request.invoiceId,
    userId: params.userId,
    action: "credit_request.updated",
    details: {
      creditRequestId: request.id,
      status,
      carrierDecision,
      approvedAmount,
    },
  });

  return { creditRequest: updated };
}
