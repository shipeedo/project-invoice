import type { CreditRequestStatus } from "@/lib/db/types";
import type { CreditReasonCode } from "@/lib/credit-reasons";
import { formatCreditLineReason, isCreditReasonCode } from "@/lib/credit-reasons";
import { roundToTwoDecimals } from "@/lib/format";

export type CreditRequestLineItem = {
  /**
   * Free-text charge description. Only present on rows created before the
   * reason picker replaced the description field; new lines describe
   * themselves through their reason.
   */
  description?: string | null;
  requestedAmount?: number | null;
  quantity?: number | null;
  serviceType?: string | null;
  reference?: string | null;
  reason?: CreditReasonCode | null;
  reasonDetail?: string | null;
  // Legacy fields from requests built from extracted invoice lines; still
  // parsed so stored rows keep rendering and exporting.
  lineIndex?: number;
  lineNumber?: number;
  invoiceAmount?: number | null;
};

export type CreateCreditLineInput = {
  description?: string | null;
  requestedAmount: number;
  quantity?: number | null;
  reference?: string | null;
  reason: CreditReasonCode;
  reasonDetail?: string | null;
};

/** Still waiting on the carrier — nothing has been decided yet. */
export const OPEN_CREDIT_STATUSES: CreditRequestStatus[] = ["PENDING", "SUBMITTED"];

/**
 * User-facing wording for each credit status. Kept here rather than derived
 * from the enum so "PARTIALLY_APPROVED" reads as "Partially approved" and the
 * labels stay distinct from invoice statuses.
 */
export const CREDIT_STATUS_LABELS: Record<CreditRequestStatus, string> = {
  PENDING: "Pending",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  PARTIALLY_APPROVED: "Partially approved",
  REJECTED: "Rejected",
};

/** One-line explanation, shown as the badge tooltip. */
export const CREDIT_STATUS_DESCRIPTIONS: Record<CreditRequestStatus, string> = {
  PENDING: "Created, not yet sent to the carrier",
  SUBMITTED: "Sent to the carrier, awaiting their decision",
  APPROVED: "The carrier approved the full requested amount",
  PARTIALLY_APPROVED: "The carrier approved less than the requested amount",
  REJECTED: "The carrier rejected the credit",
};

export function creditStatusLabel(status: string) {
  return CREDIT_STATUS_LABELS[status as CreditRequestStatus] ?? status;
}

export function parseCreditRequestLineItems(
  raw: string | null | undefined,
): CreditRequestLineItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CreditRequestLineItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isCreditRequestOpen(status: CreditRequestStatus) {
  return OPEN_CREDIT_STATUSES.includes(status);
}

/**
 * What to show in a "Description" column. Legacy lines carry their own text;
 * lines captured through the reason picker fall back to the reason itself.
 */
export function creditLineDescription(line: CreditRequestLineItem) {
  return line.description?.trim() || formatCreditLineReason(line);
}

export function sumRequestedAmounts(lineItems: CreditRequestLineItem[]) {
  return lineItems.reduce((total, line) => total + (line.requestedAmount ?? 0), 0);
}

export const GST_RATE = 0.1;

export function computeGstCreditAmount(subtotal: number): number | null {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return null;
  return roundToTwoDecimals(subtotal * GST_RATE);
}

export function resolveDefaultApprovedAmount(
  requestedTotal: number | null | undefined,
  lineItemsJson: string | null | undefined,
) {
  if (requestedTotal != null && requestedTotal > 0) return requestedTotal;
  const sum = sumRequestedAmounts(parseCreditRequestLineItems(lineItemsJson));
  return sum > 0 ? sum : null;
}

/**
 * Which "the carrier said yes" status applies. Anything short of the requested
 * total is a partial approval, so the shortfall stays visible instead of
 * reading as a clean win. Compared in whole cents to keep float noise from
 * turning an exact match into a partial.
 */
export function resolveApprovalStatus(
  approvedAmount: number,
  requestedTotal: number | null | undefined,
): Extract<CreditRequestStatus, "APPROVED" | "PARTIALLY_APPROVED"> {
  if (requestedTotal == null || !Number.isFinite(requestedTotal) || requestedTotal <= 0) {
    return "APPROVED";
  }
  return Math.round(approvedAmount * 100) < Math.round(requestedTotal * 100)
    ? "PARTIALLY_APPROVED"
    : "APPROVED";
}

/** How much of the request the carrier withheld, or null when nothing is short. */
export function creditShortfall(request: {
  status: CreditRequestStatus;
  requestedTotal: number | null;
  approvedAmount: number | null;
}) {
  if (request.status !== "PARTIALLY_APPROVED") return null;
  if (request.requestedTotal == null || request.approvedAmount == null) return null;
  const shortfall = roundToTwoDecimals(request.requestedTotal - request.approvedAmount);
  return shortfall > 0 ? shortfall : null;
}

export function parseCreateCreditLinesInput(raw: unknown): CreateCreditLineInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const lines: CreateCreditLineInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { description, requestedAmount, quantity, reference, reason, reasonDetail } =
      entry as {
        description?: unknown;
        requestedAmount?: unknown;
        quantity?: unknown;
        reference?: unknown;
        reason?: unknown;
        reasonDetail?: unknown;
      };
    if (description != null && typeof description !== "string") return null;
    if (
      typeof requestedAmount !== "number" ||
      !Number.isFinite(requestedAmount) ||
      requestedAmount <= 0
    ) {
      return null;
    }
    if (
      quantity != null &&
      (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0)
    ) {
      return null;
    }
    if (reference != null && typeof reference !== "string") return null;
    if (typeof reason !== "string" || !isCreditReasonCode(reason)) return null;
    if (reasonDetail != null && typeof reasonDetail !== "string") return null;
    // The reason is the only thing identifying a credit line now that lines
    // carry no description, so "Other" without its detail would render and
    // export as a bare "Other".
    if (reason === "OTHER" && !String(reasonDetail ?? "").trim()) return null;

    lines.push({
      description: description == null ? null : description.trim() || null,
      requestedAmount,
      quantity: quantity == null ? null : quantity,
      reference: reference == null ? null : reference.trim() || null,
      reason,
      reasonDetail:
        reasonDetail == null ? null : String(reasonDetail).trim() || null,
    });
  }

  return lines;
}

export function buildCreditRequestLineItems(
  inputs: CreateCreditLineInput[],
): CreditRequestLineItem[] {
  return inputs.map((input) => ({
    description: input.description?.trim() || null,
    requestedAmount: input.requestedAmount,
    quantity: input.quantity ?? null,
    reference: input.reference ?? null,
    reason: input.reason,
    reasonDetail: input.reasonDetail ?? null,
  }));
}
