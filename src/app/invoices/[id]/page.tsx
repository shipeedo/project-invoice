import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { and, asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CreditRequestForm } from "@/components/credit-request-form";
import { InvoiceActions } from "@/components/invoice-actions";
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
import { auditEvents, db, invoices, notes, suppliers } from "@/lib/db";
import { htmlToPlainText } from "@/lib/email-body";
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

const BOILERPLATE_EMAIL_BODY =
  /^(see attachment\.?|see attached\.?|please see attached\.?|please find attached\.?|find attached\.?|attached\.?|file attached\.?)$/i;

function isBoilerplateEmailBody(
  bodyText: string | null | undefined,
  bodyHtml: string | null | undefined,
) {
  const text = (bodyText ?? (bodyHtml ? htmlToPlainText(bodyHtml) : "")).trim();
  if (!text) return true;
  if (BOILERPLATE_EMAIL_BODY.test(text)) return true;
  return text.length <= 40 && /\battach(ed|ment)?\b/i.test(text);
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
      creditRequests: {
        with: {
          createdBy: { columns: { id: true, name: true, email: true } },
        },
        orderBy: (requests, { desc: orderDesc }) => [orderDesc(requests.createdAt)],
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

  const sourceAttachments = getSourceAttachments(invoice);
  const showEmailBody =
    invoice.sourceType === "EMAIL" &&
    !isBoilerplateEmailBody(invoice.emailBodyText, invoice.emailBodyHtml);

  const sourceCard = (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle>
          {invoice.sourceType === "EMAIL" ? "Source email & attachments" : "Source file"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        {sourceAttachments.length > 0 ? (
          <SourceAttachmentList attachments={sourceAttachments} />
        ) : null}

        {invoice.sourceType === "EMAIL" ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
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
                <dd className="font-medium">{formatDate(invoice.emailReceivedAt)}</dd>
              </div>
            </dl>

            {showEmailBody && invoice.emailBodyText ? (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {invoice.emailBodyText}
              </div>
            ) : showEmailBody && invoice.emailBodyHtml ? (
              <div
                className="prose prose-sm min-h-0 max-w-none flex-1 overflow-y-auto rounded-lg bg-muted/40 p-3"
                dangerouslySetInnerHTML={{ __html: invoice.emailBodyHtml }}
              />
            ) : null}
          </>
        ) : sourceAttachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No source file available.</p>
        ) : null}
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
          <StatusBadge status={invoice.status} />
        </div>

        {invoice.parseError ? (
          <Alert variant="destructive">
            <AlertDescription>Extraction issue: {invoice.parseError}</AlertDescription>
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

        <CreditRequestForm
          invoiceId={invoice.id}
          defaultSubject={`Credit request — ${invoice.vendorName ?? invoice.originalFileName ?? "Invoice"}`}
          defaultRecipient={invoice.vendorEmail ?? invoice.emailFrom}
          creditRequests={invoice.creditRequests}
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

      </div>
    </AppShell>
  );
}
