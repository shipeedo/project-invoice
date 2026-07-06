import { and, eq, isNull } from "drizzle-orm";
import { db, invoices } from "@/lib/db";

export async function findDuplicateSupplierInvoice(params: {
  organizationId: string;
  supplierId: string;
  invoiceNumber?: string | null;
  invoiceDate?: Date | null;
  totalAmount?: number | null;
}) {
  if (params.invoiceNumber?.trim()) {
    const byNumber = await db.query.invoices.findFirst({
      where: and(
        eq(invoices.organizationId, params.organizationId),
        eq(invoices.supplierId, params.supplierId),
        eq(invoices.invoiceNumber, params.invoiceNumber.trim()),
        isNull(invoices.deletedAt),
      ),
    });
    if (byNumber) return byNumber;
  }

  if (params.totalAmount != null && params.invoiceDate) {
    const byAmountAndDate = await db.query.invoices.findFirst({
      where: and(
        eq(invoices.organizationId, params.organizationId),
        eq(invoices.supplierId, params.supplierId),
        eq(invoices.totalAmount, params.totalAmount),
        eq(invoices.invoiceDate, params.invoiceDate),
        isNull(invoices.deletedAt),
      ),
    });
    if (byAmountAndDate) return byAmountAndDate;
  }

  return null;
}
