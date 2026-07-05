import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { and, asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InvoiceHeaderActions } from "@/components/invoice-header-actions";
import { InvoiceLineItemsTable } from "@/components/invoice-line-items-table";
import { InvoiceValidationPanel } from "@/components/invoice-validation-panel";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  auditEvents,
  db,
  invoicePayments,
  invoices,
  mailboxMessages,
  notes,
  suppliers,
  users,
} from "@/lib/db";
import { describeAuditEvent } from "@/lib/audit-log";
import { parseExtractionCandidates } from "@/lib/extraction-types";
import { isExtractionPending, outstandingAmount } from "@/lib/invoice-status";
import { parseLineItems, canDecideLineItems } from "@/lib/line-items";
import { requireSession, formatCurrency, formatDate } from "@/lib/session";
import { cn } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

function toDateInput(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

type SourceAttachment = {
  key: string;
  fileName: string;
  href: string;
  isPrimary: boolean;
};

function getSourceAttachments(invoice: {
  id: string;
  filePath: string | null;
  originalFileName: string | null;
  attachments: Array<{
    id: string;
    fileName: string;
    isPrimary: boolean | null;
  }>;
}): SourceAttachment[] {
  if (invoice.attachments.length > 0) {
    return invoice.attachments.map((attachment) => ({
      key: attachment.id,
      fileName: attachment.fileName,
      href: `/api/invoices/${invoice.id}/attachments/${attachment.id}`,
      isPrimary: attachment.isPrimary ?? false,
    }));
  }

  if (invoice.filePath) {
    return [
      {
        key: "primary-file",
        fileName: invoice.originalFileName ?? "Attachment",
        href: `/api/invoices/${invoice.id}/file`,
        isPrimary: true,
      },
    ];
  }

  return [];
}

function formatEmailRecipients(raw: string | null | undefined) {
  if (!raw) return "—";
  try {
    const emails = JSON.parse(raw) as string[];
    if (!Array.isArray(emails) || emails.length === 0) return "—";
    return emails.join(", ");
  } catch {
    return "—";
  }
}

function fileExtension(fileName: string) {
  const match = fileName.match(/\.([^.]+)$/);
  return match ? match[1].toUpperCase() : "FILE";
}

function SourceAttachmentList({ attachments }: { attachments: SourceAttachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <ul className="flex flex-col gap-3">
      {attachments.map((attachment) => (
        <li key={attachment.key}>
          <a
            href={attachment.href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "flex items-center gap-4 rounded-xl p-4 transition-colors",
              attachment.isPrimary
                ? "bg-primary/10 hover:bg-primary/15"
                : "bg-muted/50 hover:bg-muted/70",
            )}
          >
            <div
              className={cn(
                "flex size-14 shrink-0 items-center justify-center rounded-lg",
                attachment.isPrimary ? "bg-primary/10" : "bg-background",
              )}
            >
              <FileTextIcon
                className={cn(
                  "size-7",
                  attachment.isPrimary ? "text-primary" : "text-muted-foreground",
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold">{attachment.fileName}</p>
                {attachment.isPrimary ? <Badge>Primary</Badge> : null}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {fileExtension(attachment.fileName)} · Open in new tab
              </p>
            </div>
            <ExternalLinkIcon className="size-5 shrink-0 text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  );
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

  const orgUsers = await db.query.users.findMany({
    where: eq(users.organizationId, session.user.organizationId),
    columns: { id: true, name: true, email: true },
    orderBy: asc(users.name),
  });

  const lineItems = parseLineItems(invoice.lineItems);

  const candidates = parseExtractionCandidates(invoice.extractionCandidates);
  const awaitingValidation =
    invoice.status === "DRAFT" && !isExtractionPending(invoice);
  const canAssignLineItems =
    lineItems.length > 0 &&
    !isExtractionPending(invoice) &&
    !["PAID", "CANCELLED"].includes(invoice.status);
  const canDecideLineItemsOnInvoice = canDecideLineItems({
    status: invoice.status,
    validatedAt: invoice.validatedAt,
    lineItemCount: lineItems.length,
  });
  const invoiceAssignedToLabel = invoice.assignedTo
    ? (invoice.assignedTo.name ?? invoice.assignedTo.email)
    : null;

  const payments = await db.query.invoicePayments.findMany({
    where: eq(invoicePayments.invoiceId, invoice.id),
    with: { recordedBy: { columns: { name: true, email: true } } },
    orderBy: desc(invoicePayments.paidAt),
  });

  const userLabel = (userId: string | null | undefined) => {
    if (!userId) return null;
    const user = orgUsers.find((candidate) => candidate.id === userId);
    return user ? (user.name ?? user.email) : null;
  };

  const outstanding = outstandingAmount(invoice.totalAmount, invoice.amountPaid);
  const showPayments =
    payments.length > 0 || ["APPROVED", "PART_PAID", "PAID"].includes(invoice.status);

  const sourceAttachments = getSourceAttachments(invoice);

  const sourceMessage =
    invoice.sourceType === "EMAIL"
      ? await db.query.mailboxMessages.findFirst({
          where: eq(mailboxMessages.invoiceId, invoice.id),
          columns: { toEmails: true },
        })
      : null;

  const sourceCard = (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle>
          {invoice.sourceType === "EMAIL" ? "Source email & attachments" : "Source file"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        {invoice.sourceType === "EMAIL" ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">From</dt>
              <dd className="font-medium">
                {invoice.emailFromName
                  ? `${invoice.emailFromName} <${invoice.emailFrom ?? ""}>`
                  : (invoice.emailFrom ?? "—")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">To</dt>
              <dd className="font-medium">{formatEmailRecipients(sourceMessage?.toEmails)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Received</dt>
              <dd className="font-medium">{formatDate(invoice.emailReceivedAt)}</dd>
            </div>
          </dl>
        ) : null}

        {sourceAttachments.length > 0 ? (
          <SourceAttachmentList attachments={sourceAttachments} />
        ) : invoice.sourceType === "EMAIL" ? (
          <p className="text-sm text-muted-foreground">No attachments available.</p>
        ) : (
          <p className="text-sm text-muted-foreground">No source file available.</p>
        )}
      </CardContent>
    </Card>
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
          <div className="flex shrink-0 flex-col items-end gap-3">
            <StatusBadge status={invoice.status} />
            <InvoiceHeaderActions
              invoiceId={invoice.id}
              status={invoice.status}
              validatedAt={invoice.validatedAt}
              assignedToId={invoice.assignedToId}
              currentUserId={session.user.id}
              currentUserRole={session.user.role}
              totalAmount={invoice.totalAmount}
              amountPaid={invoice.amountPaid}
              currency={invoice.currency ?? "AUD"}
            />
          </div>
        </div>

        {invoice.parseError ? (
          <Alert variant="destructive">
            <AlertDescription>Extraction issue: {invoice.parseError}</AlertDescription>
          </Alert>
        ) : null}

        {invoice.status === "ON_HOLD" ? (
          <Alert>
            <AlertDescription>
              On hold since {formatDate(invoice.onHoldAt)}
              {userLabel(invoice.onHoldById) ? ` by ${userLabel(invoice.onHoldById)}` : ""}
              {invoice.onHoldReason ? ` — ${invoice.onHoldReason}` : ""}
            </AlertDescription>
          </Alert>
        ) : null}

        {invoice.status === "CANCELLED" ? (
          <Alert variant="destructive">
            <AlertDescription>
              Cancelled {formatDate(invoice.cancelledAt)}
              {userLabel(invoice.cancelledById)
                ? ` by ${userLabel(invoice.cancelledById)}`
                : ""}
            </AlertDescription>
          </Alert>
        ) : null}

        {awaitingValidation ? (
          <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
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
                respondByDate: toDateInput(invoice.respondByDate),
                totalAmount:
                  invoice.totalAmount != null ? String(invoice.totalAmount) : "",
                currency: invoice.currency ?? "AUD",
              }}
              lineItems={lineItems}
              supplierId={invoice.supplierId}
              supplierName={invoice.supplier?.name ?? null}
              suppliers={supplierOptions}
            />
            {sourceCard}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Extracted header</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Supplier</dt>
                    <dd className="font-medium">{invoice.vendorName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Supplier email</dt>
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
                    <dt className="text-muted-foreground">Respond by</dt>
                    <dd className="font-medium">{formatDate(invoice.respondByDate)}</dd>
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
            {sourceCard}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceLineItemsTable
              key={`${invoice.id}-${invoice.updatedAt?.toString() ?? "new"}`}
              invoiceId={invoice.id}
              lineItems={lineItems}
              users={orgUsers}
              invoiceAssignedToId={invoice.assignedToId}
              invoiceAssignedToLabel={invoiceAssignedToLabel}
              currency={invoice.currency ?? "AUD"}
              actionsEnabled={canAssignLineItems}
              decisionsEnabled={canDecideLineItemsOnInvoice}
            />
          </CardContent>
        </Card>

        {showPayments ? (
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Invoice total</dt>
                  <dd className="font-medium">
                    {formatCurrency(invoice.totalAmount, invoice.currency ?? "AUD")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Paid</dt>
                  <dd className="font-medium">
                    {formatCurrency(invoice.amountPaid, invoice.currency ?? "AUD")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Outstanding</dt>
                  <dd className="font-medium">
                    {outstanding != null
                      ? formatCurrency(outstanding, invoice.currency ?? "AUD")
                      : "—"}
                  </dd>
                </div>
              </dl>

              {invoice.status === "PAID" ? (
                <p className="text-sm text-muted-foreground">
                  Marked as paid {formatDate(invoice.paidAt)}
                  {userLabel(invoice.markedPaidById)
                    ? ` by ${userLabel(invoice.markedPaidById)}`
                    : ""}
                  .
                </p>
              ) : null}

              {payments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Recorded by</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatDate(payment.paidAt)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(payment.amount, invoice.currency ?? "AUD")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {payment.recordedBy
                            ? (payment.recordedBy.name ?? payment.recordedBy.email)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {payment.note ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {payment.transactionRef ? (
                            /^https?:\/\//.test(payment.transactionRef) ? (
                              <a
                                href={payment.transactionRef}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline underline-offset-2"
                              >
                                View accounting transaction
                              </a>
                            ) : (
                              payment.transactionRef
                            )
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Audit trail</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {invoice.auditEvents.map((event) => {
                const display = describeAuditEvent(
                  event.action,
                  event.details,
                  invoice.currency ?? "AUD",
                );
                return (
                  <li key={event.id} className="border-b pb-3 last:border-0">
                    <p className="font-medium">{display.label}</p>
                    {display.description ? (
                      <p className="text-muted-foreground">{display.description}</p>
                    ) : null}
                    <p className="text-muted-foreground">
                      {formatDate(event.createdAt)}
                      {event.user ? ` · ${event.user.name ?? event.user.email}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

      </div>
    </AppShell>
  );
}
