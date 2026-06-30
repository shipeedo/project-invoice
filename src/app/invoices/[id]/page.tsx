import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CreditDraftForm } from "@/components/credit-draft-form";
import { InvoiceActions } from "@/components/invoice-actions";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { auditEvents, db, invoices, notes } from "@/lib/db";
import { requireSession, formatCurrency, formatDate } from "@/lib/session";
import type { ExtractedLineItem } from "@/lib/extraction";
import { cn } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const session = await requireSession();
  const { id } = await params;

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
    ),
    with: {
      assignedTo: { columns: { name: true, email: true } },
      notes: { orderBy: desc(notes.createdAt) },
      auditEvents: {
        with: { user: { columns: { name: true, email: true } } },
        orderBy: desc(auditEvents.createdAt),
      },
      creditDrafts: {
        with: { createdBy: { columns: { name: true, email: true } } },
        orderBy: (drafts, { desc: orderDesc }) => [orderDesc(drafts.createdAt)],
      },
    },
  });

  if (!invoice) {
    notFound();
  }

  const lineItems = invoice.lineItems
    ? (JSON.parse(invoice.lineItems) as ExtractedLineItem[])
    : [];

  return (
    <AppShell user={session.user}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/queue" className="text-sm text-muted-foreground hover:underline">
              ← Back to queue
            </Link>
            <h2 className="mt-2 text-2xl font-semibold">
              {invoice.vendorName ?? invoice.originalFileName ?? "Invoice"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Received {formatDate(invoice.createdAt)} · Assigned to{" "}
              {invoice.assignedTo?.name ?? invoice.assignedTo?.email ?? "Unassigned"}
            </p>
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        {invoice.parseError ? (
          <Alert variant="destructive">
            <AlertDescription>Extraction issue: {invoice.parseError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Extracted header</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Vendor</dt>
                  <dd className="font-medium">{invoice.vendorName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Vendor email</dt>
                  <dd className="font-medium">{invoice.vendorEmail ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Invoice number</dt>
                  <dd className="font-medium">{invoice.invoiceNumber ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Invoice date</dt>
                  <dd className="font-medium">{formatDate(invoice.invoiceDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="font-medium">
                    {formatCurrency(invoice.totalAmount, invoice.currency ?? "AUD")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="font-medium">{invoice.sourceType.toLowerCase()}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Source file</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{invoice.originalFileName}</p>
              <a
                href={`/api/invoices/${invoice.id}/file`}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                View PDF
              </a>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            {lineItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No line items extracted.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => (
                    <TableRow key={`${item.description}-${index}`}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.quantity ?? "—"}</TableCell>
                      <TableCell>
                        {item.unitPrice != null
                          ? formatCurrency(item.unitPrice, invoice.currency ?? "AUD")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {item.amount != null
                          ? formatCurrency(item.amount, invoice.currency ?? "AUD")
                          : "—"}
                      </TableCell>
                      <TableCell>{item.reference ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <InvoiceActions invoiceId={invoice.id} status={invoice.status} />

        <CreditDraftForm
          invoiceId={invoice.id}
          defaultSubject={`Credit request — ${invoice.vendorName ?? invoice.originalFileName ?? "Invoice"}`}
        />

        <Card>
          <CardHeader>
            <CardTitle>Audit trail</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {invoice.auditEvents.map((event) => (
                <li key={event.id} className="border-b pb-3 last:border-0">
                  <p className="font-medium">{event.action}</p>
                  <p className="text-muted-foreground">
                    {formatDate(event.createdAt)}
                    {event.user ? ` · ${event.user.name ?? event.user.email}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {invoice.creditDrafts.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Credit drafts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4 text-sm">
                {invoice.creditDrafts.map((draft) => (
                  <li key={draft.id} className="rounded-lg border p-4">
                    <p className="font-medium">{draft.subject}</p>
                    <p className="mt-2 whitespace-pre-wrap">{draft.message}</p>
                    <p className="mt-2 text-muted-foreground">
                      {formatDate(draft.createdAt)} · {draft.createdBy.name ?? draft.createdBy.email}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
