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

export const OPEN_CREDIT_STATUSES: CreditRequestStatus[] = [
  "DRAFT",
  "SENT",
  "AWAITING_USER",
  "CONTESTED",
];

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
