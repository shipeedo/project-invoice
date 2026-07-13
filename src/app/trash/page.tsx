import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { InvoiceTrashActions } from "@/components/invoice-trash-actions";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db, invoices } from "@/lib/db";
import {
  TRASH_RETENTION_DAYS,
  daysUntilTrashExpiry,
  invoiceInVisibleTrash,
} from "@/lib/invoice-trash";
import { getNavCounts } from "@/lib/nav-counts";
import { requireSession, formatCurrency, formatDate } from "@/lib/session";

export default async function TrashPage() {
  const session = await requireSession();

  const [rows, navCounts] = await Promise.all([
    db.query.invoices.findMany({
      where: and(
        eq(invoices.organizationId, session.user.organizationId),
        invoiceInVisibleTrash(),
      ),
      with: {
        deletedBy: { columns: { name: true, email: true } },
        supplier: { columns: { id: true, name: true } },
      },
      orderBy: desc(invoices.deletedAt),
    }),
    getNavCounts(session.user.organizationId, session.user.id),
  ]);

  return (
    <AppShell
      user={session.user}
      activePath="/trash"
      navCounts={navCounts}
      breadcrumbs={[{ label: "Trash" }]}
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Trash</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deleted invoices are kept here for {TRASH_RETENTION_DAYS} days, then removed from
            view. Restore an invoice to return it to the queue.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deleted invoices.</p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead>Expires in</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((invoice) => {
                  const label =
                    invoice.vendorName ??
                    invoice.originalFileName ??
                    invoice.emailSubject ??
                    "Invoice";
                  const deletedAt = invoice.deletedAt!;
                  const deletedBy =
                    invoice.deletedBy?.name ?? invoice.deletedBy?.email ?? "Unknown";

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="font-medium hover:underline"
                          >
                            {label}
                          </Link>
                          {invoice.supplier ? (
                            <p className="text-xs text-muted-foreground">
                              {invoice.supplier.name}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{formatDate(deletedAt)}</p>
                          <p className="text-xs text-muted-foreground">by {deletedBy}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {daysUntilTrashExpiry(deletedAt)} day
                        {daysUntilTrashExpiry(deletedAt) === 1 ? "" : "s"}
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice.totalAmount != null
                          ? formatCurrency(invoice.totalAmount, invoice.currency ?? "AUD")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <InvoiceTrashActions
                          invoiceId={invoice.id}
                          deletedAt={deletedAt.toISOString()}
                          vendorName={label}
                          variant="row"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
