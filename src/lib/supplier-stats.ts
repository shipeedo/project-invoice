import { and, count, eq, isNotNull, max, sql } from "drizzle-orm";
import { db, invoices } from "@/lib/db";

export type SupplierInvoiceStats = {
  invoiceCount: number;
  lastInvoiceAt: Date | string | null;
};

export async function getSupplierInvoiceStats(
  organizationId: string,
): Promise<Map<string, SupplierInvoiceStats>> {
  const rows = await db
    .select({
      supplierId: invoices.supplierId,
      invoiceCount: count(),
      lastInvoiceAt: max(
        sql`COALESCE(${invoices.emailReceivedAt}, ${invoices.createdAt})`,
      ),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        isNotNull(invoices.supplierId),
      ),
    )
    .groupBy(invoices.supplierId);

  const stats = new Map<string, SupplierInvoiceStats>();
  for (const row of rows) {
    if (!row.supplierId) continue;
    stats.set(row.supplierId, {
      invoiceCount: row.invoiceCount,
      lastInvoiceAt: row.lastInvoiceAt ?? null,
    });
  }
  return stats;
}

export function emptySupplierInvoiceStats(): SupplierInvoiceStats {
  return { invoiceCount: 0, lastInvoiceAt: null };
}
