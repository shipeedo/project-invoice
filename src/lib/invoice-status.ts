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
];

export const UNCANCELLABLE_STATUSES: InvoiceStatus[] = ["CANCELLED"];

export function canCancelInvoice(status: InvoiceStatus): boolean {
  return !UNCANCELLABLE_STATUSES.includes(status);
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
