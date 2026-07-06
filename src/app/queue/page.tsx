import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { InvoiceQueue } from "@/components/invoice-queue";
import { AppShell } from "@/components/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { db, invoices, suppliers, users } from "@/lib/db";
import { RESPOND_BY_BUSINESS_DAYS } from "@/lib/invoice-deadlines";
import { invoiceNotDeleted } from "@/lib/invoice-trash";
import { getNavCounts } from "@/lib/nav-counts";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function QueuePage() {
  const session = await requireSession();

  const [rows, supplierRows, userRows, navCounts] = await Promise.all([
    db.query.invoices.findMany({
      where: and(
        eq(invoices.organizationId, session.user.organizationId),
        invoiceNotDeleted(),
      ),
      with: {
        assignedTo: { columns: { id: true, name: true, email: true } },
        supplier: { columns: { id: true, name: true } },
      },
      orderBy: desc(invoices.createdAt),
    }),
    db.query.suppliers.findMany({
      where: eq(suppliers.organizationId, session.user.organizationId),
      columns: { id: true, name: true },
      orderBy: asc(suppliers.name),
    }),
    db.query.users.findMany({
      where: eq(users.organizationId, session.user.organizationId),
      columns: { id: true, name: true, email: true },
      orderBy: asc(users.name),
    }),
    getNavCounts(session.user.organizationId),
  ]);

  const serializedInvoices = rows.map((invoice) => ({
    id: invoice.id,
    status: invoice.status,
    vendorName: invoice.vendorName,
    originalFileName: invoice.originalFileName,
    invoiceNumber: invoice.invoiceNumber,
    emailSubject: invoice.emailSubject,
    totalAmount: invoice.totalAmount,
    currency: invoice.currency,
    parseError: invoice.parseError,
    createdAt: invoice.createdAt.toISOString(),
    validatedAt: invoice.validatedAt?.toISOString() ?? null,
    dueDate: invoice.dueDate?.toISOString() ?? null,
    respondByDate: invoice.respondByDate?.toISOString() ?? null,
    assignedToId: invoice.assignedToId,
    supplierId: invoice.supplierId,
    assignedTo: invoice.assignedTo,
    supplier: invoice.supplier,
  }));

  return (
    <AppShell
      user={session.user}
      activePath="/queue"
      navCounts={navCounts}
      breadcrumbs={[{ label: "Invoices" }]}
    >
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Invoices</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Search and filter invoices by supplier, assignee, status, and urgency.
              Respond-by is {RESPOND_BY_BUSINESS_DAYS} business days after validation.
            </p>
          </div>
          <Link href="/upload" className={cn(buttonVariants())}>
            Upload invoice
          </Link>
        </div>

        <InvoiceQueue
          invoices={serializedInvoices}
          suppliers={supplierRows}
          users={userRows}
          currentUserId={session.user.id}
        />
      </div>
    </AppShell>
  );
}
