import { GST_RATE } from "@/lib/credit-line-utils";
import type { ExtractedLineItem } from "@/lib/extraction";
import { roundToTwoDecimals } from "@/lib/format";

export type InvoiceTotals = {
  subtotal: number | null;
  taxAmount: number | null;
  total: number | null;
};

/** Where the totals saved on the invoice come from. */
export const INVOICE_TOTALS_SOURCES = ["DOCUMENT", "LINE_ITEMS"] as const;
export type InvoiceTotalsSource = (typeof INVOICE_TOTALS_SOURCES)[number];

/**
 * Validates an untrusted totals-source value. Undefined defaults to
 * DOCUMENT (the pre-existing behaviour: keep the extracted totals).
 * Returns null when the payload is present but not a known source.
 */
export function parseInvoiceTotalsSource(raw: unknown): InvoiceTotalsSource | null {
  if (raw === undefined) return "DOCUMENT";
  return INVOICE_TOTALS_SOURCES.includes(raw as InvoiceTotalsSource)
    ? (raw as InvoiceTotalsSource)
    : null;
}

/**
 * Totals implied by the given line items. Line amounts are ex-GST by
 * convention (carrier invoices list GST separately), so GST is added at
 * GST_RATE. Returns nulls when no line has a usable amount.
 */
export function computeLineItemTotals(lineItems: ExtractedLineItem[]): InvoiceTotals {
  const amounts = lineItems
    .map((item) => item.amount)
    .filter((amount): amount is number => amount != null && Number.isFinite(amount));

  if (amounts.length === 0) {
    return { subtotal: null, taxAmount: null, total: null };
  }

  const subtotal = roundToTwoDecimals(amounts.reduce((sum, amount) => sum + amount, 0));
  const taxAmount = roundToTwoDecimals(subtotal * GST_RATE);
  return {
    subtotal,
    taxAmount,
    total: roundToTwoDecimals(subtotal + taxAmount),
  };
}
