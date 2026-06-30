import { asc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { SuppliersManager } from "@/components/suppliers-manager";
import { db, suppliers } from "@/lib/db";
import { requireRole } from "@/lib/session";

export default async function SuppliersPage() {
  const session = await requireRole(["ADMIN"]);

  const rows = await db.query.suppliers.findMany({
    where: eq(suppliers.organizationId, session.user.organizationId),
    orderBy: asc(suppliers.name),
  });

  return (
    <AppShell user={session.user} activePath="/admin/suppliers">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Suppliers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Maintain supplier contact details used by routing and future mailbox matching.
          </p>
        </div>
        <SuppliersManager
          initialSuppliers={rows.map((supplier) => ({
            ...supplier,
            emailAddresses: JSON.parse(supplier.emailAddresses) as string[],
            emailDomains: JSON.parse(supplier.emailDomains) as string[],
          }))}
        />
      </div>
    </AppShell>
  );
}
