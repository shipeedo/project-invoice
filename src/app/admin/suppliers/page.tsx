import { asc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { SuppliersManager } from "@/components/suppliers-manager";
import { db, suppliers } from "@/lib/db";
import { parseSupplierFieldMappings } from "@/lib/extraction-types";
import { getSupplierSuggestions } from "@/lib/email-contacts";
import {
  emptySupplierInvoiceStats,
  getSupplierInvoiceStats,
} from "@/lib/supplier-stats";
import { getNavCounts } from "@/lib/nav-counts";
import { requireRole } from "@/lib/session";

export default async function SuppliersPage() {
  const session = await requireRole(["ADMIN"]);
  const organizationId = session.user.organizationId;

  const [rows, suggestions, stats, navCounts] = await Promise.all([
    db.query.suppliers.findMany({
      where: eq(suppliers.organizationId, organizationId),
      orderBy: asc(suppliers.name),
    }),
    getSupplierSuggestions(organizationId),
    getSupplierInvoiceStats(organizationId),
    getNavCounts(organizationId),
  ]);

  return (
    <AppShell
      user={session.user}
      activePath="/admin/suppliers"
      navCounts={navCounts}
      breadcrumbs={[{ label: "Admin" }, { label: "Suppliers" }]}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Suppliers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Maintain supplier contact details, extraction prompts, and field mappings used during
            invoice processing.
          </p>
        </div>
        <SuppliersManager
          initialSuppliers={rows.map((supplier) => {
            const invoiceStats = stats.get(supplier.id) ?? emptySupplierInvoiceStats();
            return {
              id: supplier.id,
              name: supplier.name,
              emailAddresses: JSON.parse(supplier.emailAddresses) as string[],
              emailDomains: JSON.parse(supplier.emailDomains) as string[],
              tradingTermDays: supplier.tradingTermDays,
              extractionPrompt: supplier.extractionPrompt,
              fieldMappings: parseSupplierFieldMappings(supplier.fieldMappings),
              invoiceCount: invoiceStats.invoiceCount,
              lastInvoiceAt: invoiceStats.lastInvoiceAt,
            };
          })}
          initialSuggestions={suggestions}
        />
      </div>
    </AppShell>
  );
}
