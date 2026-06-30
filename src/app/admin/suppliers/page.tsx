import { AppShell } from "@/components/app-shell";
import { SuppliersManager } from "@/components/suppliers-manager";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

export default async function SuppliersPage() {
  const session = await requireRole(["ADMIN"]);

  const suppliers = await db.supplier.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { name: "asc" },
  });

  return (
    <AppShell user={session.user}>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Suppliers</h2>
          <p className="mt-1 text-sm text-slate-600">
            Maintain supplier contact details used by routing and future mailbox matching.
          </p>
        </div>
        <SuppliersManager
          initialSuppliers={suppliers.map((supplier) => ({
            ...supplier,
            emailAddresses: JSON.parse(supplier.emailAddresses) as string[],
            emailDomains: JSON.parse(supplier.emailDomains) as string[],
          }))}
        />
      </div>
    </AppShell>
  );
}
