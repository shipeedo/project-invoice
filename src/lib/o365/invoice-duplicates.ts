import { and, eq, isNull, sql } from "drizzle-orm";
import { db, invoices } from "@/lib/db";

/**
 * Finds an existing invoice that the incoming extraction is a repeat of.
 *
 * Matching is deliberately NOT scoped to `supplierId`. Supplier resolution
 * fails often enough that scoping by it skipped the check entirely for the
 * majority of real duplicates — every duplicate group observed in production
 * had at least one copy with a null `supplier_id`, so the two copies could
 * never match each other. The invoice number and total carry the identity
 * here; the supplier record does not.
 *
 * Two rules, in order:
 *   1. same total AND same invoice number (case-insensitive)
 *   2. same total AND same invoice date — catches re-sends where the invoice
 *      number failed to extract
 *
 * Rule 2 is broad: total+date alone collides across unrelated suppliers, so an
 * invoice that genuinely happens to share both with another supplier's invoice
 * will be skipped rather than imported. That trade was made deliberately in
 * favour of catching re-sends with no extractable invoice number.
 */
export async function findDuplicateSupplierInvoice(params: {
  organizationId: string;
  invoiceNumber?: string | null;
  invoiceDate?: Date | null;
  totalAmount?: number | null;
}) {
  const invoiceNumber = params.invoiceNumber?.trim();

  if (invoiceNumber && params.totalAmount != null) {
    const byNumberAndTotal = await db.query.invoices.findFirst({
      where: and(
        eq(invoices.organizationId, params.organizationId),
        sql`lower(trim(${invoices.invoiceNumber})) = ${invoiceNumber.toLowerCase()}`,
        eq(invoices.totalAmount, params.totalAmount),
        isNull(invoices.deletedAt),
      ),
    });
    if (byNumberAndTotal) return byNumberAndTotal;
  }

  if (params.totalAmount != null && params.invoiceDate) {
    const byAmountAndDate = await db.query.invoices.findFirst({
      where: and(
        eq(invoices.organizationId, params.organizationId),
        eq(invoices.totalAmount, params.totalAmount),
        eq(invoices.invoiceDate, params.invoiceDate),
        isNull(invoices.deletedAt),
      ),
    });
    if (byAmountAndDate) return byAmountAndDate;
  }

  return null;
}
