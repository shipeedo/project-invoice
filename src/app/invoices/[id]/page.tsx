import { and, asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InvoiceCreditsSection } from "@/components/invoice-credits-section";
import { InvoiceAttachmentPreviews } from "@/components/invoice-attachment-previews";
import { InvoiceSourceAttachments } from "@/components/invoice-source-attachments";
import { InvoiceSourceEmailSheet } from "@/components/invoice-source-email-sheet";
import { InvoiceHeaderActions } from "@/components/invoice-header-actions";
import { InvoiceReprocessButton } from "@/components/invoice-reprocess-button";
import { InvoiceTrashActions } from "@/components/invoice-trash-actions";
import { InvoiceDueDate } from "@/components/invoice-due-date";
import { InvoiceLineItemsTable } from "@/components/invoice-line-items-table";
import { InvoiceValidationPanel } from "@/components/invoice-validation-panel";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  auditEvents,
  creditRequests,
  db,
  invoices,
  mailboxMessages,
  notes,
  suppliers,
  users,
} from "@/lib/db";
import { describeAuditEvent } from "@/lib/audit-log";
import { parseExtractionCandidates } from "@/lib/extraction-types";
import { resolveInvoiceSourceEmail } from "@/lib/invoice-source-email";
import { isExtractionPending } from "@/lib/invoice-status";
import {
  TRASH_RETENTION_DAYS,
  daysUntilTrashExpiry,
  isInvoiceDeleted,
  isInvoiceVisibleInTrash,
} from "@/lib/invoice-trash";
import { parseLineItems, canDecideLineItems } from "@/lib/line-items";
import { getNavCounts } from "@/lib/nav-counts";
import { requireSession, formatCurrency, formatDate } from "@/lib/session";

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
  mimeType?: string | null;
  filePath: string | null;
  isPrimary: boolean;
};

function getSourceAttachments(invoice: {
  id: string;
  filePath: string | null;
  fileMimeType: string | null;
  originalFileName: string | null;
  attachments: Array<{
    id: string;
    fileName: string;
    filePath: string;
    mimeType: string | null;
    isPrimary: boolean | null;
  }>;
}): SourceAttachment[] {
  if (invoice.attachments.length > 0) {
    return invoice.attachments.map((attachment) => ({
      key: attachment.id,
      fileName: attachment.fileName,
      href: `/api/invoices/${invoice.id}/attachments/${attachment.id}`,
      mimeType: attachment.mimeType,
      filePath: attachment.filePath,
      isPrimary: attachment.isPrimary ?? false,
    }));
  }

  if (invoice.filePath) {
    return [
      {
        key: "primary-file",
        fileName: invoice.originalFileName ?? "Attachment",
        href: `/api/invoices/${invoice.id}/file`,
        mimeType: invoice.fileMimeType,
        filePath: invoice.filePath,
        isPrimary: true,
      },
    ];
  }

  return [];
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const session = await requireSession();
  const { id } = await params;
  const navCountsPromise = getNavCounts(session.user.organizationId);

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
    ),
    with: {
      assignedTo: { columns: { name: true, email: true } },
      supplier: { columns: { id: true, name: true, tradingTermDays: true } },
      validatedBy: { columns: { name: true, email: true } },
      deletedBy: { columns: { name: true, email: true } },
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

  if (isInvoiceDeleted(invoice) && !isInvoiceVisibleInTrash(invoice.deletedAt)) {
    notFound();
  }

  const inTrash = isInvoiceDeleted(invoice);

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
    invoice.status !== "CANCELLED";
  const canRequestLineCredits =
    lineItems.length > 0 &&
    !isExtractionPending(invoice) &&
    invoice.status !== "CANCELLED";
  const canDecideLineItemsOnInvoice = canDecideLineItems({
    status: invoice.status,
    validatedAt: invoice.validatedAt,
    lineItemCount: lineItems.length,
  });
  const invoiceAssignedToLabel = invoice.assignedTo
    ? (invoice.assignedTo.name ?? invoice.assignedTo.email)
    : null;

  const invoiceCreditRequests = await db.query.creditRequests.findMany({
    where: eq(creditRequests.invoiceId, invoice.id),
    orderBy: desc(creditRequests.createdAt),
  });

  const userLabel = (userId: string | null | undefined) => {
    if (!userId) return null;
    const user = orgUsers.find((candidate) => candidate.id === userId);
    return user ? (user.name ?? user.email) : null;
  };

  const sourceAttachments = getSourceAttachments(invoice);

  const sourceMessage =
    invoice.sourceType === "EMAIL"
      ? await db.query.mailboxMessages.findFirst({
          where: and(
            eq(mailboxMessages.invoiceId, invoice.id),
            eq(mailboxMessages.organizationId, session.user.organizationId),
          ),
          columns: {
            subject: true,
            fromEmail: true,
            fromName: true,
            toEmails: true,
            ccEmails: true,
            receivedAt: true,
            bodyHtml: true,
            bodyText: true,
            threadId: true,
          },
          with: {
            attachments: {
              columns: {
                id: true,
                fileName: true,
                isInline: true,
                contentId: true,
              },
            },
          },
        })
      : null;

  const sourceEmail = resolveInvoiceSourceEmail({
    invoice,
    message: sourceMessage,
  });

  const sourceCard = (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle>
          {invoice.sourceType === "EMAIL" ? "Source email & attachments" : "Source file"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        {invoice.sourceType === "EMAIL" ? (
          <>
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
                <dd className="font-medium">
                  {sourceEmail && sourceEmail.toEmails.length > 0
                    ? sourceEmail.toEmails.join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Received</dt>
                <dd className="font-medium">{formatDate(invoice.emailReceivedAt)}</dd>
              </div>
            </dl>
            {sourceEmail ? (
              <div>
                <InvoiceSourceEmailSheet email={sourceEmail} />
              </div>
            ) : null}
          </>
        ) : null}

        {sourceAttachments.length > 0 ? (
          <InvoiceSourceAttachments attachments={sourceAttachments} />
        ) : invoice.sourceType === "EMAIL" ? (
          <p className="text-sm text-muted-foreground">No attachments available.</p>
        ) : (
          <p className="text-sm text-muted-foreground">No source file available.</p>
        )}
      </CardContent>
    </Card>
  );

  const navCounts = await navCountsPromise;

  return (
    <AppShell
      user={session.user}
      activePath={`/invoices/${invoice.id}`}
      navCounts={navCounts}
      breadcrumbs={[
        { label: "Invoices", href: "/queue" },
        ...(inTrash ? [{ label: "Trash", href: "/trash" }] : []),
        { label: invoice.vendorName ?? invoice.originalFileName ?? "Invoice" },
      ]}
    >
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold">
                {invoice.vendorName ?? invoice.originalFileName ?? "Invoice"}
              </h2>
              <StatusBadge status={invoice.status} />
            </div>
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            {inTrash ? (
              <InvoiceTrashActions
                invoiceId={invoice.id}
                deletedAt={invoice.deletedAt}
                vendorName={invoice.vendorName ?? invoice.originalFileName}
              />
            ) : (
              <>
                {invoice.status === "DRAFT" ? (
                  <InvoiceReprocessButton
                    invoiceId={invoice.id}
                    sourceType={invoice.sourceType}
                    attachments={sourceAttachments.map((attachment) => ({
                      id: attachment.key,
                      fileName: attachment.fileName,
                      mimeType: attachment.mimeType,
                      isPrimary: attachment.isPrimary,
                    }))}
                  />
                ) : null}
                <InvoiceHeaderActions
                  invoiceId={invoice.id}
                  status={invoice.status}
                  validatedAt={invoice.validatedAt}
                  assignedToId={invoice.assignedToId}
                  currentUserId={session.user.id}
                  currentUserRole={session.user.role}
                />
                <InvoiceTrashActions
                  invoiceId={invoice.id}
                  vendorName={invoice.vendorName ?? invoice.originalFileName}
                />
              </>
            )}
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

        {inTrash ? (
          <Alert>
            <AlertDescription>
              In trash since {formatDate(invoice.deletedAt)}
              {invoice.deletedBy
                ? ` by ${invoice.deletedBy.name ?? invoice.deletedBy.email}`
                : userLabel(invoice.deletedById)
                  ? ` by ${userLabel(invoice.deletedById)}`
                  : ""}
              . Restorable for {daysUntilTrashExpiry(invoice.deletedAt!)} more day
              {daysUntilTrashExpiry(invoice.deletedAt!) === 1 ? "" : "s"} (kept for{" "}
              {TRASH_RETENTION_DAYS} days).
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

        {awaitingValidation && !inTrash ? (
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
            extractedTotals={{
              subtotal: invoice.subtotalAmount,
              taxAmount: invoice.taxAmount,
            }}
            sourceSlot={sourceCard}
          />
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
                    <dd>
                      <InvoiceDueDate
                        dueDate={invoice.dueDate}
                        originalDueDate={invoice.originalDueDate}
                        tradingTermDays={invoice.supplier?.tradingTermDays ?? null}
                      />
                    </dd>
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

        {!awaitingValidation || inTrash ? (
          <InvoiceAttachmentPreviews attachments={sourceAttachments} />
        ) : null}

        {/* During validation the panel renders its own line-item selection table. */}
        {awaitingValidation && !inTrash ? null : (
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
              <InvoiceLineItemsTable
                key={`${invoice.id}-${invoice.updatedAt?.toString() ?? "new"}`}
                invoiceId={invoice.id}
                lineItems={lineItems}
                users={orgUsers}
                invoiceAssignedToId={invoice.assignedToId}
                invoiceAssignedToLabel={invoiceAssignedToLabel}
                currency={invoice.currency ?? "AUD"}
                actionsEnabled={canRequestLineCredits && !inTrash}
                editsEnabled={canAssignLineItems && !inTrash}
                decisionsEnabled={canDecideLineItemsOnInvoice && !inTrash}
                totals={{
                  subtotal: invoice.subtotalAmount,
                  taxAmount: invoice.taxAmount,
                  total: invoice.totalAmount,
                }}
              />
            </CardContent>
          </Card>
        )}

        <InvoiceCreditsSection
          creditRequests={invoiceCreditRequests.map((request) => ({
            id: request.id,
            status: request.status,
            carrierDecision: request.carrierDecision,
            subject: request.subject,
            requestedTotal: request.requestedTotal,
            approvedAmount: request.approvedAmount,
            lineItems: request.lineItems,
            createdAt: request.createdAt.toISOString(),
          }))}
          currency={invoice.currency ?? "AUD"}
        />

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
