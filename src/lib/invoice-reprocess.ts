import { and, eq } from "drizzle-orm";
import { db, invoiceAttachments, invoices } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { parseInvoiceDate } from "@/lib/extraction";
import { isInvoiceDeleted } from "@/lib/invoice-trash";
import {
  runInvoiceExtraction,
  type SavedAttachment,
} from "@/lib/o365/process-email";
import { resolveDueDate } from "@/lib/trading-terms";

/** Sentinel id for an upload-source invoice's file, which has no attachment row. */
export const PRIMARY_FILE_ATTACHMENT_ID = "primary-file";

export type ReprocessExtraFile = {
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
};

/**
 * Re-runs data extraction on a draft invoice's source (the linked email's
 * attachments and body, or the uploaded file) and replaces every extracted
 * field on the invoice. The stored source files are never modified, and a
 * failed extraction keeps the previous values (only the parse error is
 * recorded).
 */
export async function reprocessDraftInvoice(params: {
  organizationId: string;
  userId: string;
  invoiceId: string;
  /**
   * Attachment ids to extract from (`PRIMARY_FILE_ATTACHMENT_ID` for an
   * upload-source file without an attachment row). Omit to use all.
   * Deselected attachments stay on the invoice; they are only ignored as
   * extraction input.
   */
  selectedAttachmentIds?: string[];
  /** Additional files (already saved to uploads) to attach and extract from. */
  extraFiles?: ReprocessExtraFile[];
}) {
  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, params.invoiceId),
      eq(invoices.organizationId, params.organizationId),
    ),
    with: { attachments: true },
  });

  if (!invoice) {
    return { error: "Not found" as const, status: 404 };
  }

  if (isInvoiceDeleted(invoice)) {
    return { error: "Invoices in the trash cannot be re-processed" as const, status: 400 };
  }

  if (invoice.status !== "DRAFT") {
    return { error: "Only draft invoices can be re-processed" as const, status: 400 };
  }

  // Upload-source invoices store their file directly on the invoice; surface
  // it as a selectable pseudo-attachment alongside any real rows.
  const sourceEntries = invoice.attachments.map((attachment) => ({
    id: attachment.id,
    fileName: attachment.fileName,
    filePath: attachment.filePath,
    mimeType: attachment.mimeType ?? "application/octet-stream",
    size: attachment.size ?? 0,
  }));
  if (
    invoice.filePath &&
    !invoice.attachments.some((attachment) => attachment.filePath === invoice.filePath)
  ) {
    sourceEntries.push({
      id: PRIMARY_FILE_ATTACHMENT_ID,
      fileName: invoice.originalFileName ?? "Invoice",
      filePath: invoice.filePath,
      mimeType: invoice.fileMimeType ?? "application/octet-stream",
      size: 0,
    });
  }

  const selectedEntries = params.selectedAttachmentIds
    ? sourceEntries.filter((entry) =>
        params.selectedAttachmentIds!.includes(entry.id),
      )
    : sourceEntries;

  const savedAttachments: SavedAttachment[] = [
    ...selectedEntries.map((entry) => ({
      fileName: entry.fileName,
      filePath: entry.filePath,
      mimeType: entry.mimeType,
      size: entry.size,
      isPrimary: false,
    })),
    ...(params.extraFiles ?? []).map((file) => ({
      fileName: file.fileName,
      filePath: file.filePath,
      mimeType: file.mimeType,
      size: file.size,
      isPrimary: false,
    })),
  ];

  const hasEmailBody =
    invoice.sourceType === "EMAIL" &&
    Boolean(invoice.emailBodyText?.trim() || invoice.emailBodyHtml?.trim());

  if (savedAttachments.length === 0 && !hasEmailBody) {
    return {
      error: "Select at least one attachment or upload a file to re-process from" as const,
      status: 400,
    };
  }

  const outcome = await runInvoiceExtraction({
    organizationId: params.organizationId,
    savedAttachments,
    emailContext:
      invoice.sourceType === "EMAIL"
        ? {
            messageId: invoice.sourceMessageId ?? invoice.id,
            subject: invoice.emailSubject,
            fromEmail: invoice.emailFrom,
            fromName: invoice.emailFromName,
            receivedAt: invoice.emailReceivedAt,
            bodyHtml: invoice.emailBodyHtml,
            bodyText: invoice.emailBodyText,
          }
        : { messageId: invoice.id },
    // Prefer the supplier already linked to the invoice so its custom
    // extraction prompt is used; extraction re-resolves when unset.
    supplierId: invoice.supplierId,
    // Re-processing is always user-initiated, so trust the user like manual
    // inbox imports do instead of second-guessing with statement detection.
    skipStatementDetection: true,
  });

  const { extraction, lineItems, fieldCandidates, supplier, primaryAttachment } =
    outcome;
  const parseError = extraction.error ?? outcome.portalFetchError ?? null;

  // Persist files extraction introduced: user uploads and any portal PDF
  // fetched during the run (runInvoiceExtraction appends those in place).
  const knownPaths = new Set(
    invoice.attachments.map((attachment) => attachment.filePath),
  );
  if (invoice.filePath) knownPaths.add(invoice.filePath);
  const newAttachments = savedAttachments.filter(
    (entry) => !knownPaths.has(entry.filePath),
  );
  if (newAttachments.length > 0) {
    await db.insert(invoiceAttachments).values(
      newAttachments.map((entry) => ({
        invoiceId: invoice.id,
        fileName: entry.fileName,
        filePath: entry.filePath,
        mimeType: entry.mimeType,
        size: entry.size,
        isPrimary: entry.isPrimary,
      })),
    );
  }
  // The upload-source pseudo-attachment gains a real row once other files
  // exist, so the source card can list them all.
  if (
    invoice.filePath &&
    newAttachments.length > 0 &&
    !invoice.attachments.some((attachment) => attachment.filePath === invoice.filePath)
  ) {
    await db.insert(invoiceAttachments).values({
      invoiceId: invoice.id,
      fileName: invoice.originalFileName ?? "Invoice",
      filePath: invoice.filePath,
      mimeType: invoice.fileMimeType,
      size: null,
      isPrimary: primaryAttachment?.filePath === invoice.filePath,
    });
  }

  // The primary attachment may change (e.g. an uploaded file or a newly
  // fetched portal PDF). Deselected rows are never primary.
  for (const attachment of invoice.attachments) {
    const isPrimary = primaryAttachment?.filePath === attachment.filePath;
    if (attachment.isPrimary !== isPrimary) {
      await db
        .update(invoiceAttachments)
        .set({ isPrimary })
        .where(eq(invoiceAttachments.id, attachment.id));
    }
  }

  if (!extraction.data) {
    // Extraction failed: keep the previously extracted values so a bad re-run
    // never destroys data; only record what went wrong.
    const [updatedInvoice] = await db
      .update(invoices)
      .set({ parseError, updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id))
      .returning();

    await recordAuditEvent({
      invoiceId: invoice.id,
      userId: params.userId,
      action: "invoice.reprocessed",
      details: {
        sourceType: invoice.sourceType,
        parseError,
        attachmentCount: savedAttachments.length,
        keptPreviousValues: true,
      },
    });

    return { invoice: updatedInvoice, parseError };
  }

  const invoiceDate = parseInvoiceDate(extraction.data.invoiceDate);
  const resolvedDueDate = resolveDueDate({
    invoiceDate,
    extractedDueDate: parseInvoiceDate(extraction.data.dueDate),
    tradingTermDays: supplier?.tradingTermDays,
  });

  const [updatedInvoice] = await db
    .update(invoices)
    .set({
      originalFileName: primaryAttachment?.fileName ?? invoice.originalFileName,
      filePath: primaryAttachment?.filePath ?? invoice.filePath,
      fileMimeType: primaryAttachment?.mimeType ?? invoice.fileMimeType,
      vendorName: extraction.data.vendorName ?? null,
      vendorEmail:
        extraction.data.vendorEmail ??
        (invoice.sourceType === "EMAIL" ? invoice.emailFrom : null),
      invoiceNumber: extraction.data.invoiceNumber ?? null,
      invoiceDate,
      dueDate: resolvedDueDate.dueDate,
      originalDueDate: resolvedDueDate.originalDueDate,
      respondByDate: parseInvoiceDate(extraction.data.respondByDate),
      totalAmount: extraction.data.totalAmount ?? null,
      subtotalAmount: extraction.data.subtotal ?? null,
      taxAmount: extraction.data.taxAmount ?? null,
      currency: extraction.data.currency ?? "AUD",
      lineItems: lineItems.length > 0 ? JSON.stringify(lineItems) : null,
      extractionCandidates: fieldCandidates ? JSON.stringify(fieldCandidates) : null,
      extractionRaw: extraction.raw ? JSON.stringify(extraction.raw) : null,
      parseError,
      supplierId: supplier?.id ?? invoice.supplierId,
      // Fresh extraction invalidates any prior validation of the old values.
      validatedAt: null,
      validatedById: null,
      status: "DRAFT",
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id))
    .returning();

  await recordAuditEvent({
    invoiceId: invoice.id,
    userId: params.userId,
    action: "invoice.reprocessed",
    details: {
      sourceType: invoice.sourceType,
      parseError,
      supplierId: supplier?.id ?? invoice.supplierId,
      attachmentCount: savedAttachments.length,
      uploadedFileCount: params.extraFiles?.length ?? 0,
      lineItemCount: lineItems.length,
    },
  });

  if (resolvedDueDate.overridden) {
    await recordAuditEvent({
      invoiceId: invoice.id,
      userId: params.userId,
      action: "invoice.due_date_overridden",
      details: {
        supplierId: supplier?.id ?? null,
        tradingTermDays: resolvedDueDate.tradingTermDays,
        originalDueDate: resolvedDueDate.originalDueDate?.toISOString() ?? null,
        dueDate: resolvedDueDate.dueDate?.toISOString() ?? null,
      },
    });
  }

  return { invoice: updatedInvoice, parseError };
}
