import { and, asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InvoiceCreditsSection } from "@/components/invoice-credits-section";
import { InvoiceActionsMenu } from "@/components/invoice-actions-menu";
import { InvoiceAttachmentPreviews } from "@/components/invoice-attachment-previews";
import { InvoiceSourceEmailSheet } from "@/components/invoice-source-email-sheet";
import { InvoiceAssigneeControl } from "@/components/invoice-assignee-control";
import { InvoiceDocumentsCard } from "@/components/invoice-documents-card";
import { InvoiceNotesSheet } from "@/components/invoice-notes-sheet";
import { InvoiceDueDate } from "@/components/invoice-due-date";
import { InvoiceValidationPanel } from "@/components/invoice-validation-panel";
import { CreditAlertBadge } from "@/components/credit-alert-badge";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  auditEvents,
  creditRequests,
  db,
  invoiceDocuments,
  invoices,
  mailboxMessages,
  notes,
  rebills,
  suppliers,
  users,
} from "@/lib/db";
import { recordInvoiceView } from "@/lib/audit";
import { describeAuditEvent } from "@/lib/audit-log";
import { resolveInvoiceSourceEmail } from "@/lib/invoice-source-email";
import { getInvoiceCreditAlert } from "@/lib/invoice-credit-alert";
import { isExtractionPending } from "@/lib/invoice-status";
import {
  TRASH_RETENTION_DAYS,
  daysUntilTrashExpiry,
  isInvoiceDeleted,
  isInvoiceVisibleInTrash,
} from "@/lib/invoice-trash";
import { getSourceAttachments } from "@/lib/invoice-source-files";
import { toSupplierMatchTarget } from "@/lib/supplier-matching";
import { getNavCounts } from "@/lib/nav-counts";
import { requireSession, formatCurrency, formatDate } from "@/lib/session";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ note?: string }>;
};

function toDateInput(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export default async function InvoiceDetailPage({ params, searchParams }: PageProps) {
  const session = await requireSession();
  const { id } = await params;
  const { note: deepLinkedNoteId } = await searchParams;
  const navCountsPromise = getNavCounts(session.user.organizationId, session.user.id);

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
      notes: {
        orderBy: desc(notes.createdAt),
        with: {
          user: { columns: { name: true, email: true } },
          document: { columns: { id: true, fileName: true } },
        },
      },
      documents: {
        orderBy: desc(invoiceDocuments.createdAt),
        with: {
          uploadedBy: { columns: { name: true, email: true } },
          rebill: { columns: { customerName: true } },
          creditRequest: { columns: { subject: true } },
        },
      },
      rebills: { orderBy: desc(rebills.createdAt) },
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

  await recordInvoiceView({ invoiceId: invoice.id, userId: session.user.id });

  const supplierRows = await db.query.suppliers.findMany({
    where: eq(suppliers.organizationId, session.user.organizationId),
    columns: { id: true, name: true, emailAddresses: true, emailDomains: true },
    orderBy: asc(suppliers.name),
  });
  // Addresses and domains travel to the client so the draft screen can rank
  // matches as the reviewer edits, using the same rules the server applies.
  const supplierOptions = supplierRows.map(toSupplierMatchTarget);

  const orgUsers = await db.query.users.findMany({
    where: eq(users.organizationId, session.user.organizationId),
    columns: { id: true, name: true, email: true },
    orderBy: asc(users.name),
  });

  const awaitingValidation =
    invoice.status === "DRAFT" && !isExtractionPending(invoice);

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

  const latestRebill = invoice.rebills[0] ?? null;
  const hasCreditDocument = invoice.documents.some(
    (document) => document.kind === "CREDIT",
  );
  const liveCreditStatuses = invoiceCreditRequests
    .map((request) => request.status)
    .filter((status) => status !== "REJECTED");
  const creditAlert = getInvoiceCreditAlert({
    status: invoice.status,
    creditStatuses: invoiceCreditRequests.map((request) => request.status),
  });

  const noteItems = invoice.notes.map((note) => ({
    id: note.id,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    authorId: note.userId,
    authorName: note.user ? (note.user.name ?? note.user.email) : null,
    document: note.document
      ? { id: note.document.id, fileName: note.document.fileName }
      : null,
  }));

  const documentItems = invoice.documents.map((document) => ({
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    kind: document.kind,
    size: document.size,
    createdAt: document.createdAt.toISOString(),
    uploaderName: document.uploadedBy
      ? (document.uploadedBy.name ?? document.uploadedBy.email)
      : null,
    rebillCustomerName: document.rebill?.customerName ?? null,
    creditRequestSubject: document.creditRequest?.subject ?? null,
  }));

  // Source files (email attachments or the uploaded file) shown as the
  // "Original" group at the top of the Documents card.
  const receivedAtIso = (invoice.emailReceivedAt ?? invoice.createdAt).toISOString();
  const originalItems = sourceAttachments.map((attachment) => ({
    key: attachment.key,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType ?? null,
    size: attachment.size,
    receivedAt: receivedAtIso,
    isPrimary: attachment.isPrimary,
    streamUrl: attachment.href,
    previewUrl: attachment.previewHref,
  }));

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
          {invoice.sourceType === "EMAIL" ? "Source email" : "Source file"}
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
            <p className="text-sm text-muted-foreground">
              Email attachments are listed under Documents.
            </p>
          </>
        ) : sourceAttachments.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Uploaded as “{sourceAttachments[0].fileName}”. The original file is
            listed under Documents.
          </p>
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
              {creditAlert ? <CreditAlertBadge alert={creditAlert} /> : null}
              {hasCreditDocument && !creditAlert ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                >
                  Credit attached
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Received {formatDate(invoice.createdAt)}
              {invoice.validatedAt
                ? ` · Validated ${formatDate(invoice.validatedAt)} by ${invoice.validatedBy?.name ?? invoice.validatedBy?.email ?? "unknown"}`
                : null}
              {invoice.assignedTo
                ? ` · Assigned to ${invoice.assignedTo.name ?? invoice.assignedTo.email}`
                : null}
              {latestRebill ? ` · Rebilled to ${latestRebill.customerName}` : null}
              {invoice.accountReference
                ? ` · Account ref: ${invoice.accountReference}`
                : null}
            </p>
            {invoice.supplier ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Supplier: {invoice.supplier.name}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!inTrash ? (
              <InvoiceAssigneeControl
                invoiceId={invoice.id}
                assignedToId={invoice.assignedToId}
                assignedToName={
                  invoice.assignedTo
                    ? (invoice.assignedTo.name ?? invoice.assignedTo.email)
                    : null
                }
                currentUserId={session.user.id}
                status={invoice.status}
              />
            ) : null}
            <InvoiceNotesSheet
              invoiceId={invoice.id}
              notes={noteItems}
              canCompose={!inTrash}
              currentUserId={session.user.id}
              initialNoteId={deepLinkedNoteId ?? null}
            />
            <InvoiceActionsMenu
              invoiceId={invoice.id}
              status={invoice.status}
              validatedAt={invoice.validatedAt}
              assignedToId={invoice.assignedToId}
              currentUserId={session.user.id}
              currentUserRole={session.user.role}
              inTrash={inTrash}
              vendorName={invoice.vendorName ?? invoice.originalFileName}
              sourceType={invoice.sourceType}
              currency={invoice.currency ?? "AUD"}
              reprocessAttachments={sourceAttachments.map((attachment) => ({
                id: attachment.key,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                isPrimary: attachment.isPrimary,
              }))}
              existingCreditCount={liveCreditStatuses.length}
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
            initialFields={{
              vendorName: invoice.vendorName ?? "",
              vendorEmail: invoice.vendorEmail ?? "",
              invoiceNumber: invoice.invoiceNumber ?? "",
              invoiceDate: toDateInput(invoice.invoiceDate),
              dueDate: toDateInput(invoice.dueDate),
              respondByDate: toDateInput(invoice.respondByDate),
              totalAmount:
                invoice.totalAmount != null ? String(invoice.totalAmount) : "",
              subtotalAmount:
                invoice.subtotalAmount != null ? String(invoice.subtotalAmount) : "",
              taxAmount: invoice.taxAmount != null ? String(invoice.taxAmount) : "",
              currency: invoice.currency ?? "AUD",
            }}
            supplierId={invoice.supplierId}
            supplierName={invoice.supplier?.name ?? null}
            suppliers={supplierOptions}
            canExtractSupplier={sourceMessage != null}
            sourceSlot={
              <>
                {sourceCard}
                <InvoiceAttachmentPreviews attachments={sourceAttachments} />
              </>
            }
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
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd className="font-medium">
                      {invoice.subtotalAmount != null
                        ? formatCurrency(invoice.subtotalAmount, invoice.currency ?? "AUD")
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">GST</dt>
                    <dd className="font-medium">
                      {invoice.taxAmount != null
                        ? formatCurrency(invoice.taxAmount, invoice.currency ?? "AUD")
                        : "—"}
                    </dd>
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

        <InvoiceDocumentsCard
          invoiceId={invoice.id}
          originals={originalItems}
          documents={documentItems}
          canModify={!inTrash}
        />

        <InvoiceCreditsSection
          invoiceId={invoice.id}
          canRequestCredit={!inTrash && invoice.status !== "CANCELLED"}
          creditRequests={invoiceCreditRequests.map((request) => ({
            id: request.id,
            status: request.status,
            subject: request.subject,
            requestedTotal: request.requestedTotal,
            approvedAmount: request.approvedAmount,
            lineItems: request.lineItems,
            createdAt: request.createdAt.toISOString(),
            submittedAt: request.submittedAt?.toISOString() ?? null,
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
