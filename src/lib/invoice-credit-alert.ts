import type { CreditRequestStatus, InvoiceStatus } from "@/lib/db/types";

export type InvoiceCreditAlert = {
  /** Short badge text, sits next to the status badge. */
  label: string;
  /** Long-form copy for the badge tooltip. */
  detail: string;
};

/**
 * An approved invoice must not be paid at face value while a credit is still
 * in play: either the carrier hasn't answered yet, or it granted a credit that
 * has to come off the payment. A rejected credit is settled — the invoice is
 * payable as issued — so it clears the warning.
 */
export function getInvoiceCreditAlert(params: {
  status: InvoiceStatus;
  creditStatuses: CreditRequestStatus[];
}): InvoiceCreditAlert | null {
  if (params.status !== "APPROVED") return null;

  const live = params.creditStatuses.filter((status) => status !== "REJECTED");
  if (live.length === 0) return null;

  if (live.includes("APPROVED") || live.includes("PARTIALLY_APPROVED")) {
    return {
      label: "Credit to apply",
      detail:
        "Approved for payment, but the carrier granted a credit on this invoice. Deduct the credit before paying.",
    };
  }

  return {
    label: "Credit pending",
    detail:
      "Approved for payment, but a credit request is still open with the carrier. Check the credit before paying.",
  };
}
