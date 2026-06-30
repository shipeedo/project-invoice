import { asc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { SuppliersManager } from "@/components/suppliers-manager";
import { db, suppliers } from "@/lib/db";
import {
  parseSupplierFieldMappings,
} from "@/lib/extraction-types";
import { requireRole } from "@/lib/session";

export default async function SuppliersPage() {
  const session = await requireRole(["ADMIN"]);

  const rows = await db.query.suppliers.findMany({
    where: eq(suppliers.organizationId, session.user.organizationId),
    orderBy: asc(suppliers.name),
  });

  return (
    <AppShell
      user={session.user}
      activePath="/admin/suppliers"
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
          initialSuppliers={rows.map((supplier) => ({
            id: supplier.id,
            name: supplier.name,
            emailAddresses: JSON.parse(supplier.emailAddresses) as string[],
            emailDomains: JSON.parse(supplier.emailDomains) as string[],
            extractionPrompt: supplier.extractionPrompt,
            fieldMappings: parseSupplierFieldMappings(supplier.fieldMappings),
          }))}
        />
      </div>
    </AppShell>
  );
}
