import { and, asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CreditDraftForm } from "@/components/credit-draft-form";
import { InvoiceActions } from "@/components/invoice-actions";
import { InvoiceValidationPanel } from "@/components/invoice-validation-panel";
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
import { auditEvents, db, invoices, notes, suppliers } from "@/lib/db";
import { parseExtractionCandidates } from "@/lib/extraction-types";
import type { ExtractedLineItem } from "@/lib/extraction";
import { requireSession, formatCurrency, formatDate } from "@/lib/session";
import { cn } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

function toDateInput(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

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
      supplier: { columns: { id: true, name: true } },
      validatedBy: { columns: { name: true, email: true } },
      attachments: true,
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

  const supplierOptions = await db.query.suppliers.findMany({
    where: eq(suppliers.organizationId, session.user.organizationId),
    columns: { id: true, name: true },
    orderBy: asc(suppliers.name),
  });

  const lineItems = invoice.lineItems
    ? (JSON.parse(invoice.lineItems) as ExtractedLineItem[])
    : [];

  const candidates = parseExtractionCandidates(invoice.extractionCandidates);
  const awaitingValidation = ["PENDING_VALIDATION", "NEEDS_REVIEW"].includes(
    invoice.status,
  );

  return (
    <AppShell
      user={session.user}
      activePath={`/invoices/${invoice.id}`}
      breadcrumbs={[
        { label: "Invoices", href: "/queue" },
        { label: invoice.vendorName ?? invoice.originalFileName ?? "Invoice" },
      ]}
    >
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">
              {invoice.vendorName ?? invoice.originalFileName ?? "Invoice"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Received {formatDate(invoice.createdAt)}
              {invoice.validatedAt
                ? ` · Validated ${formatDate(invoice.validatedAt)} by ${invoice.validatedBy?.name ?? invoice.validatedBy?.email ?? "unknown"}`
                : null}
              {invoice.assignedTo
                ? ` · Assigned to ${invoice.assignedTo.name ?? invoice.assignedTo.email}`
                : null}
            </p>
            {invoice.supplier ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Supplier: {invoice.supplier.name}
              </p>
            ) : null}
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        {invoice.parseError ? (
          <Alert variant="destructive">
            <AlertDescription>Extraction issue: {invoice.parseError}</AlertDescription>
          </Alert>
        ) : null}

        {awaitingValidation ? (
          <InvoiceValidationPanel
            invoiceId={invoice.id}
            status={invoice.status}
            candidates={candidates}
            initialFields={{
              vendorName: invoice.vendorName ?? "",
              vendorEmail: invoice.vendorEmail ?? "",
              invoiceNumber: invoice.invoiceNumber ?? "",
              invoiceDate: toDateInput(invoice.invoiceDate),
              dueDate: toDateInput(invoice.dueDate),
              totalAmount:
                invoice.totalAmount != null ? String(invoice.totalAmount) : "",
              currency: invoice.currency ?? "AUD",
            }}
            lineItems={lineItems}
            supplierId={invoice.supplierId}
            supplierName={invoice.supplier?.name ?? null}
            suppliers={supplierOptions}
          />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                {awaitingValidation ? "Current extraction" : "Extracted header"}
              </CardTitle>
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
                  <dt className="text-muted-foreground">Due date</dt>
                  <dd className="font-medium">{formatDate(invoice.dueDate)}</dd>
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
              <CardTitle>
                {invoice.sourceType === "EMAIL" ? "Source email" : "Source file"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {invoice.sourceType === "EMAIL" ? (
                <>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Subject</dt>
                      <dd className="font-medium">{invoice.emailSubject ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">From</dt>
                      <dd className="font-medium">
                        {invoice.emailFromName
                          ? `${invoice.emailFromName} <${invoice.emailFrom ?? ""}>`
                          : (invoice.emailFrom ?? "—")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Received</dt>
                      <dd className="font-medium">
                        {formatDate(invoice.emailReceivedAt)}
                      </dd>
                    </div>
                  </dl>
                  {invoice.emailBodyText ? (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                      {invoice.emailBodyText}
                    </div>
                  ) : invoice.emailBodyHtml ? (
                    <div
                      className="prose prose-sm max-w-none rounded-md border bg-muted/30 p-3"
                      dangerouslySetInnerHTML={{ __html: invoice.emailBodyHtml }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">No email body available.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {invoice.originalFileName}
                  </p>
                  <a
                    href={`/api/invoices/${invoice.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: "outline" }))}
                  >
                    View PDF
                  </a>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {invoice.attachments.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {invoice.attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
                  >
                    <span>
                      {attachment.fileName}
                      {attachment.isPrimary ? " (primary)" : ""}
                    </span>
                    <a
                      href={`/api/invoices/${invoice.id}/attachments/${attachment.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      View
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : invoice.sourceType === "EMAIL" && invoice.filePath ? (
          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <a
                href={`/api/invoices/${invoice.id}/file`}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                View {invoice.originalFileName ?? "attachment"}
              </a>
            </CardContent>
          </Card>
        ) : null}

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
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => (
                    <TableRow key={`${item.lineNumber ?? index}-${item.description}`}>
                      <TableCell>{item.lineNumber ?? index + 1}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.serviceType ?? "—"}</TableCell>
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

        <InvoiceActions
          invoiceId={invoice.id}
          status={invoice.status}
          validatedAt={invoice.validatedAt}
        />

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
