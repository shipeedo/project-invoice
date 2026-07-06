import { and, count, eq, isNotNull, max, sql } from "drizzle-orm";
import { db, invoices } from "@/lib/db";
import { invoiceNotDeleted } from "@/lib/invoice-trash";

export type SupplierInvoiceStats = {
  invoiceCount: number;
  lastInvoiceAt: Date | null;
};

function normalizeTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

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
        invoiceNotDeleted(),
      ),
    )
    .groupBy(invoices.supplierId);

  const stats = new Map<string, SupplierInvoiceStats>();
  for (const row of rows) {
    if (!row.supplierId) continue;
    stats.set(row.supplierId, {
      invoiceCount: row.invoiceCount,
      lastInvoiceAt: normalizeTimestamp(row.lastInvoiceAt),
    });
  }
  return stats;
}

export function emptySupplierInvoiceStats(): SupplierInvoiceStats {
  return { invoiceCount: 0, lastInvoiceAt: null };
}
