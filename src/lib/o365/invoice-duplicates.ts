import { and, eq, isNull, sql } from "drizzle-orm";
import { db, invoices } from "@/lib/db";

/**
 * Deliberately does not name the fields that matched: a duplicate is found by
 * number+total or by total+date, and claiming one when the other fired misled
 * whoever read it. The skipped job links the invoice it duplicates, which
 * answers "which one?" better than describing the rule.
 */
export const DUPLICATE_SKIP_MESSAGE =
  "Skipped: this duplicates an invoice that is already imported";

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
 *   2. same total AND same invoice date — only when the incoming invoice has
 *      no number, to catch re-sends where the number failed to extract
 *
 * Rule 2 is broad: total+date alone collides across unrelated suppliers. It is
 * therefore gated on the number being absent. When a number did extract and
 * simply matched nothing, that is evidence of a genuinely new invoice, and
 * falling through to total+date would silently drop it — a far worse outcome
 * than importing a duplicate, which is at least visible and reversible.
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

  if (!invoiceNumber && params.totalAmount != null && params.invoiceDate) {
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
