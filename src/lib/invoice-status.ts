import type { InvoiceStatus } from "@/lib/db/types";

/**
 * Invoice lifecycle:
 *
 *   DRAFT            unassigned — covers extraction, validation, and routing
 *   PENDING_APPROVAL assigned to an approver
 *   APPROVED         assigned and approved
 *   REJECTED         assigned and rejected
 *   ON_HOLD          paused by the assignee or an admin (previous status is
 *                    stored so releasing the hold restores it)
 *   PART_PAID        one or more payments recorded, balance outstanding
 *   PAID             fully paid
 *   CANCELLED        withdrawn — no further action
 */

export const APPROVABLE_STATUSES: InvoiceStatus[] = ["DRAFT", "PENDING_APPROVAL"];

export const REJECTABLE_STATUSES: InvoiceStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
];

export const HOLDABLE_STATUSES: InvoiceStatus[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "PART_PAID",
];

export const PAYABLE_STATUSES: InvoiceStatus[] = ["APPROVED", "PART_PAID"];

export const UNCANCELLABLE_STATUSES: InvoiceStatus[] = ["PAID", "CANCELLED"];

export function canCancelInvoice(status: InvoiceStatus): boolean {
  return !UNCANCELLABLE_STATUSES.includes(status);
}

// Ignore sub-cent differences from floating point payment sums.
const PAYMENT_EPSILON = 0.005;

export function outstandingAmount(
  totalAmount: number | null | undefined,
  amountPaid: number,
): number | null {
  if (totalAmount == null) return null;
  return Math.max(0, totalAmount - amountPaid);
}

export function isFullyPaid(
  totalAmount: number | null | undefined,
  amountPaid: number,
): boolean {
  if (totalAmount == null) return false;
  return amountPaid >= totalAmount - PAYMENT_EPSILON;
}

export function resolvePaymentStatus(params: {
  totalAmount: number | null | undefined;
  amountPaid: number;
  markAsPaid?: boolean;
}): Extract<InvoiceStatus, "PART_PAID" | "PAID"> {
  if (params.markAsPaid || isFullyPaid(params.totalAmount, params.amountPaid)) {
    return "PAID";
  }
  return "PART_PAID";
}

export type ExtractionStateInput = {
  status: InvoiceStatus | string;
  validatedAt?: Date | string | null;
  parseError?: string | null;
  extractionRaw?: string | null;
};

/**
 * A draft invoice with no extraction output yet is still being processed
 * and should not be edited.
 */
export function isExtractionPending(invoice: ExtractionStateInput): boolean {
  return (
    invoice.status === "DRAFT" &&
    !invoice.validatedAt &&
    !invoice.parseError &&
    !invoice.extractionRaw
  );
}
