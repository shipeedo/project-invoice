import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db, invoices } from "@/lib/db";
import { requireSession, formatCurrency, formatDate } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function QueuePage() {
  const session = await requireSession();

  const rows = await db.query.invoices.findMany({
    where: eq(invoices.organizationId, session.user.organizationId),
    with: {
      assignedTo: { columns: { name: true, email: true } },
    },
    orderBy: desc(invoices.createdAt),
  });

  const myQueue = rows.filter(
    (invoice) =>
      invoice.assignedToId === session.user.id ||
      ["PENDING_APPROVAL", "NEEDS_REVIEW"].includes(invoice.status),
  );

  return (
    <AppShell
      user={session.user}
      activePath="/queue"
      breadcrumbs={[{ label: "Invoices", href: "/queue" }, { label: "Queue" }]}
    >
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Approval queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tenancy-scoped invoices from uploads and future mailbox intake.
            </p>
          </div>
          <Link href="/upload" className={cn(buttonVariants())}>
            Upload invoice
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All invoices ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No invoices yet. Upload a PDF to start the pilot flow.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                          {invoice.vendorName ?? invoice.originalFileName ?? "Unknown vendor"}
                        </Link>
                        {invoice.parseError ? (
                          <p className="text-xs text-destructive">Parse issue: {invoice.parseError}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell>
                        {formatCurrency(invoice.totalAmount, invoice.currency ?? "AUD")}
                      </TableCell>
                      <TableCell>
                        {invoice.assignedTo?.name ?? invoice.assignedTo?.email ?? "Unassigned"}
                      </TableCell>
                      <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My queue ({myQueue.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {myQueue.length === 0 ? (
                <li className="text-muted-foreground">Nothing assigned to you right now.</li>
              ) : (
                myQueue.map((invoice) => (
                  <li key={invoice.id}>
                    <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                      {invoice.vendorName ?? invoice.originalFileName} —{" "}
                      {invoice.status.toLowerCase().replaceAll("_", " ")}
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
