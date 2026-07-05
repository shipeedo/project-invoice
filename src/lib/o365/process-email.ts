import { and, eq } from "drizzle-orm";
import { readFile } from "fs/promises";
import { recordAuditEvent } from "@/lib/audit";
import { mergeLineItems, parseCsvLineItems } from "@/lib/csv-extraction";
import {
  db,
  invoiceAttachments,
  invoices,
  mailboxMessages,
  processedO365Messages,
  suppliers,
} from "@/lib/db";
import { htmlToPlainText } from "@/lib/email-body";
import {
  extractInvoiceFromEmailBody,
  extractInvoiceFromPdf,
  parseInvoiceDate,
  type ExtractedLineItem,
} from "@/lib/extraction";
import { ensureDefaultRoutingRules } from "@/lib/routing";
import {
  findMatchingSupplier,
  getSupplierExtractionContext,
  supplierHasCustomExtraction,
} from "@/lib/supplier-extraction";
import { getUploadAbsolutePath, saveBufferToUploads } from "@/lib/uploads";
import type { GraphMessage } from "@/lib/o365/graph";

type EmailAttachmentInput = {
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  size: number;
};

function isPdfAttachment(fileName: string, mimeType: string) {
  return (
    mimeType.includes("pdf") || fileName.toLowerCase().endsWith(".pdf")
  );
}

function isCsvAttachment(fileName: string, mimeType: string) {
  return (
    mimeType.includes("csv") ||
    mimeType.includes("text/plain") ||
    fileName.toLowerCase().endsWith(".csv")
  );
}

function extractSenderEmail(message: GraphMessage) {
  return message.from?.emailAddress?.address?.trim() || null;
}

function extractSenderName(message: GraphMessage) {
  return message.from?.emailAddress?.name?.trim() || null;
}

function extractEmailBody(message: GraphMessage) {
  const content = message.body?.content ?? "";
  if (message.body?.contentType?.toLowerCase() === "html") {
    return { html: content, text: message.bodyPreview ?? null };
  }
  return { html: null, text: content || message.bodyPreview || null };
}

async function resolveSupplierFromExtraction(
  organizationId: string,
  data: {
    vendorName?: string;
    vendorEmail?: string;
  },
) {
  if (data.vendorName) {
    const supplier = await findMatchingSupplier(
      organizationId,
      data.vendorName,
      data.vendorEmail,
    );
    if (supplier) return supplier;
  }

  return findMatchingSupplier(organizationId, null, data.vendorEmail);
}

export async function processEmailInvoice(params: {
  organizationId: string;
  message: GraphMessage;
  attachments: EmailAttachmentInput[];
}) {
  const existing = await db.query.processedO365Messages.findFirst({
    where: and(
      eq(processedO365Messages.organizationId, params.organizationId),
      eq(processedO365Messages.messageId, params.message.id),
    ),
  });

  if (existing) {
    return { skipped: true as const, reason: "already_processed" as const };
  }

  if (params.attachments.length === 0) {
    await db.insert(processedO365Messages).values({
      organizationId: params.organizationId,
      messageId: params.message.id,
      processedAt: new Date(),
    });
    return { skipped: true as const, reason: "no_attachments" as const };
  }

  await ensureDefaultRoutingRules(params.organizationId);

  const senderEmail = extractSenderEmail(params.message);
  const senderName = extractSenderName(params.message);
  const emailBody = extractEmailBody(params.message);
  const receivedAt = params.message.receivedDateTime
    ? new Date(params.message.receivedDateTime)
    : new Date();

  const [invoice] = await db
    .insert(invoices)
    .values({
      organizationId: params.organizationId,
      status: "DRAFT",
      sourceType: "EMAIL",
      sourceMessageId: params.message.id,
      emailSubject: params.message.subject ?? null,
      emailFrom: senderEmail,
      emailFromName: senderName,
      emailReceivedAt: receivedAt,
      emailBodyHtml: emailBody.html,
      emailBodyText: emailBody.text,
      vendorEmail: senderEmail,
    })
    .returning();

  await recordAuditEvent({
    invoiceId: invoice.id,
    action: "invoice.received",
    details: {
      sourceType: "EMAIL",
      messageId: params.message.id,
      subject: params.message.subject,
    },
  });

  const savedAttachments: Array<{
    fileName: string;
    filePath: string;
    mimeType: string;
    size: number;
    isPrimary: boolean;
  }> = [];

  for (const attachment of params.attachments) {
    const saved = await saveBufferToUploads({
      buffer: attachment.buffer,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      subdir: "email",
    });

    savedAttachments.push({
      fileName: attachment.fileName,
      filePath: saved.storedPath,
      mimeType: saved.mimeType,
      size: saved.size,
      isPrimary: false,
    });
  }

  const pdfAttachment =
    savedAttachments.find((attachment) =>
      isPdfAttachment(attachment.fileName, attachment.mimeType),
    ) ?? savedAttachments[0];

  if (pdfAttachment) {
    pdfAttachment.isPrimary = true;
  }

  if (savedAttachments.length > 0) {
    await db.insert(invoiceAttachments).values(
      savedAttachments.map((attachment) => ({
        invoiceId: invoice.id,
        fileName: attachment.fileName,
        filePath: attachment.filePath,
        mimeType: attachment.mimeType,
        size: attachment.size,
        isPrimary: attachment.isPrimary,
      })),
    );
  }

  let extraction = pdfAttachment
    ? await extractInvoiceFromPdf(
        pdfAttachment.filePath,
        pdfAttachment.fileName,
        undefined,
        {
          subject: params.message.subject,
          fromEmail: senderEmail,
          fromName: senderName,
          bodyText: emailBody.text ?? (emailBody.html ? htmlToPlainText(emailBody.html) : null),
        },
      )
    : {
        data: null,
        raw: null,
        fieldCandidates: null,
        error: "No processable attachment found",
      };

  const supplier = extraction.data
    ? await resolveSupplierFromExtraction(params.organizationId, {
        vendorName: extraction.data.vendorName,
        vendorEmail: extraction.data.vendorEmail ?? senderEmail ?? undefined,
      })
    : await resolveSupplierFromExtraction(params.organizationId, {
        vendorEmail: senderEmail ?? undefined,
      });

  if (supplier && pdfAttachment) {
    const supplierContext = await getSupplierExtractionContext(
      params.organizationId,
      supplier.id,
    );
    if (supplierHasCustomExtraction(supplierContext)) {
      extraction = await extractInvoiceFromPdf(
        pdfAttachment.filePath,
        pdfAttachment.fileName,
        supplierContext,
        {
          subject: params.message.subject,
          fromEmail: senderEmail,
          fromName: senderName,
          bodyText: emailBody.text ?? emailBody.html
            ? htmlToPlainText(emailBody.html ?? "")
            : null,
        },
      );
    }
  }

  let lineItems: ExtractedLineItem[] = extraction.data?.lineItems ?? [];
  const csvAttachment = savedAttachments.find((attachment) =>
    isCsvAttachment(attachment.fileName, attachment.mimeType),
  );

  if (csvAttachment) {
    const csvContent = await readFile(getUploadAbsolutePath(csvAttachment.filePath), "utf8");
    const csvLineItems = parseCsvLineItems(csvContent);
    lineItems = mergeLineItems(lineItems, csvLineItems);
  }

  const fieldCandidates =
    extraction.fieldCandidates ?? extraction.data?.fieldCandidates ?? null;

  const [updatedInvoice] = await db
    .update(invoices)
    .set({
      originalFileName: pdfAttachment?.fileName ?? savedAttachments[0]?.fileName,
      filePath: pdfAttachment?.filePath ?? savedAttachments[0]?.filePath,
      fileMimeType: pdfAttachment?.mimeType ?? savedAttachments[0]?.mimeType,
      vendorName: extraction.data?.vendorName,
      vendorEmail: extraction.data?.vendorEmail ?? senderEmail,
      invoiceNumber: extraction.data?.invoiceNumber,
      invoiceDate: parseInvoiceDate(extraction.data?.invoiceDate),
      dueDate: parseInvoiceDate(extraction.data?.dueDate),
      respondByDate: parseInvoiceDate(extraction.data?.respondByDate),
      totalAmount: extraction.data?.totalAmount,
      currency: extraction.data?.currency ?? "AUD",
      lineItems: lineItems.length > 0 ? JSON.stringify(lineItems) : null,
      extractionCandidates: fieldCandidates
        ? JSON.stringify(fieldCandidates)
        : null,
      extractionRaw: extraction.raw ? JSON.stringify(extraction.raw) : null,
      parseError: extraction.error ?? null,
      supplierId: supplier?.id ?? null,
      status: "DRAFT",
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id))
    .returning();

  await recordAuditEvent({
    invoiceId: invoice.id,
    action: extraction.error ? "invoice.parse_failed" : "invoice.extracted",
    details: {
      sourceType: "EMAIL",
      parseError: extraction.error,
      attachmentCount: savedAttachments.length,
    },
  });

  await db.insert(processedO365Messages).values({
    organizationId: params.organizationId,
    messageId: params.message.id,
    invoiceId: updatedInvoice.id,
    processedAt: new Date(),
  });

  const result = await db.query.invoices.findFirst({
    where: eq(invoices.id, updatedInvoice.id),
    with: { supplier: true, assignedTo: true, attachments: true },
  });

  return { skipped: false as const, invoice: result ?? updatedInvoice };
}

type SavedAttachment = {
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
  isPrimary: boolean;
};

async function runInvoiceExtraction(params: {
  organizationId: string;
  savedAttachments: SavedAttachment[];
  emailContext: {
    subject?: string | null;
    fromEmail?: string | null;
    fromName?: string | null;
    bodyText?: string | null;
    bodyHtml?: string | null;
  };
  supplierId?: string | null;
}) {
  const bodyText =
    params.emailContext.bodyText?.trim() ||
    (params.emailContext.bodyHtml ? htmlToPlainText(params.emailContext.bodyHtml) : null);

  const emailContextForPdf = {
    subject: params.emailContext.subject,
    fromEmail: params.emailContext.fromEmail,
    fromName: params.emailContext.fromName,
    bodyText,
  };

  const pdfAttachment =
    params.savedAttachments.find((attachment) =>
      isPdfAttachment(attachment.fileName, attachment.mimeType),
    ) ?? null;

  if (pdfAttachment) {
    pdfAttachment.isPrimary = true;
  } else if (params.savedAttachments[0]) {
    params.savedAttachments[0].isPrimary = true;
  }

  const supplierContext = params.supplierId
    ? await getSupplierExtractionContext(params.organizationId, params.supplierId)
    : null;

  const customSupplierContext =
    supplierContext && supplierHasCustomExtraction(supplierContext)
      ? supplierContext
      : undefined;

  const extraction = pdfAttachment
    ? await extractInvoiceFromPdf(
        pdfAttachment.filePath,
        pdfAttachment.fileName,
        customSupplierContext,
        emailContextForPdf,
      )
    : bodyText
      ? await extractInvoiceFromEmailBody(
          {
            subject: params.emailContext.subject,
            fromEmail: params.emailContext.fromEmail,
            fromName: params.emailContext.fromName,
            bodyText,
            attachmentNames: params.savedAttachments.map((attachment) => attachment.fileName),
          },
          customSupplierContext,
        )
      : {
          data: null,
          raw: null,
          fieldCandidates: null,
          error: "No PDF attachment or email body to extract from",
        };

  const senderEmail = params.emailContext.fromEmail;

  let resolvedSupplier = params.supplierId
    ? (await db.query.suppliers.findFirst({
        where: and(
          eq(suppliers.id, params.supplierId),
          eq(suppliers.organizationId, params.organizationId),
        ),
      })) ?? null
    : null;

  if (!resolvedSupplier && extraction.data) {
    resolvedSupplier = await resolveSupplierFromExtraction(params.organizationId, {
      vendorName: extraction.data.vendorName,
      vendorEmail: extraction.data.vendorEmail ?? senderEmail ?? undefined,
    });
  }

  if (!resolvedSupplier) {
    resolvedSupplier = await resolveSupplierFromExtraction(params.organizationId, {
      vendorEmail: senderEmail ?? undefined,
    });
  }

  let lineItems: ExtractedLineItem[] = extraction.data?.lineItems ?? [];
  const csvAttachment = params.savedAttachments.find((attachment) =>
    isCsvAttachment(attachment.fileName, attachment.mimeType),
  );

  if (csvAttachment) {
    const csvContent = await readFile(getUploadAbsolutePath(csvAttachment.filePath), "utf8");
    const csvLineItems = parseCsvLineItems(csvContent);
    lineItems = mergeLineItems(lineItems, csvLineItems);
  }

  const primaryAttachment = pdfAttachment ?? params.savedAttachments[0] ?? null;
  const fieldCandidates =
    extraction.fieldCandidates ?? extraction.data?.fieldCandidates ?? null;

  return {
    extraction,
    lineItems,
    fieldCandidates,
    primaryAttachment,
    supplier: resolvedSupplier,
  };
}

export async function processMailboxMessageInvoice(params: {
  organizationId: string;
  messageId: string;
}) {
  const message = await db.query.mailboxMessages.findFirst({
    where: and(
      eq(mailboxMessages.id, params.messageId),
      eq(mailboxMessages.organizationId, params.organizationId),
    ),
    with: {
      attachments: true,
      supplier: true,
    },
  });

  if (!message) {
    return { error: "Message not found" as const };
  }

  if (message.direction !== "INBOUND") {
    return { error: "Only inbound messages can be processed as invoices" as const };
  }

  if (!message.supplierId) {
    return { error: "Link a supplier to this message before creating an invoice" as const };
  }

  if (message.invoiceId) {
    return {
      error: "An invoice has already been created from this message" as const,
      invoiceId: message.invoiceId,
    };
  }

  const existingProcessed = await db.query.processedO365Messages.findFirst({
    where: and(
      eq(processedO365Messages.organizationId, params.organizationId),
      eq(processedO365Messages.messageId, message.graphMessageId),
    ),
  });

  if (existingProcessed?.invoiceId) {
    return {
      error: "An invoice has already been created from this message" as const,
      invoiceId: existingProcessed.invoiceId,
    };
  }

  const fileAttachments = message.attachments.filter((attachment) => !attachment.isInline);
  const bodyText =
    message.bodyText?.trim() ||
    (message.bodyHtml ? htmlToPlainText(message.bodyHtml) : null);

  if (fileAttachments.length === 0 && !bodyText) {
    return { error: "Message has no body or attachments to extract from" as const };
  }

  await ensureDefaultRoutingRules(params.organizationId);

  const [invoice] = await db
    .insert(invoices)
    .values({
      organizationId: params.organizationId,
      status: "DRAFT",
      sourceType: "EMAIL",
      sourceMessageId: message.graphMessageId,
      emailSubject: message.subject,
      emailFrom: message.fromEmail,
      emailFromName: message.fromName,
      emailReceivedAt: message.receivedAt,
      emailBodyHtml: message.bodyHtml,
      emailBodyText: message.bodyText ?? bodyText,
      vendorEmail: message.fromEmail,
      supplierId: message.supplierId,
    })
    .returning();

  await recordAuditEvent({
    invoiceId: invoice.id,
    action: "invoice.received",
    details: {
      sourceType: "EMAIL",
      messageId: message.graphMessageId,
      subject: message.subject,
      triggeredBy: "manual",
    },
  });

  const savedAttachments: SavedAttachment[] = fileAttachments.map((attachment) => ({
    fileName: attachment.fileName,
    filePath: attachment.filePath,
    mimeType: attachment.mimeType ?? "application/octet-stream",
    size: attachment.size ?? 0,
    isPrimary: false,
  }));

  const { extraction, lineItems, fieldCandidates, primaryAttachment, supplier } =
    await runInvoiceExtraction({
      organizationId: params.organizationId,
      savedAttachments,
      emailContext: {
        subject: message.subject,
        fromEmail: message.fromEmail,
        fromName: message.fromName,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
      },
      supplierId: message.supplierId,
    });

  if (savedAttachments.length > 0) {
    await db.insert(invoiceAttachments).values(
      savedAttachments.map((attachment) => ({
        invoiceId: invoice.id,
        fileName: attachment.fileName,
        filePath: attachment.filePath,
        mimeType: attachment.mimeType,
        size: attachment.size,
        isPrimary: attachment.isPrimary,
      })),
    );
  }

  const [updatedInvoice] = await db
    .update(invoices)
    .set({
      originalFileName: primaryAttachment?.fileName ?? null,
      filePath: primaryAttachment?.filePath ?? null,
      fileMimeType: primaryAttachment?.mimeType ?? null,
      vendorName: extraction.data?.vendorName ?? message.supplier?.name,
      vendorEmail: extraction.data?.vendorEmail ?? message.fromEmail,
      invoiceNumber: extraction.data?.invoiceNumber,
      invoiceDate: parseInvoiceDate(extraction.data?.invoiceDate),
      dueDate: parseInvoiceDate(extraction.data?.dueDate),
      respondByDate: parseInvoiceDate(extraction.data?.respondByDate),
      totalAmount: extraction.data?.totalAmount,
      currency: extraction.data?.currency ?? "AUD",
      lineItems: lineItems.length > 0 ? JSON.stringify(lineItems) : null,
      extractionCandidates: fieldCandidates ? JSON.stringify(fieldCandidates) : null,
      extractionRaw: extraction.raw ? JSON.stringify(extraction.raw) : null,
      parseError: extraction.error ?? null,
      supplierId: supplier?.id ?? message.supplierId,
      status: "DRAFT",
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id))
    .returning();

  await recordAuditEvent({
    invoiceId: invoice.id,
    action: extraction.error ? "invoice.parse_failed" : "invoice.extracted",
    details: {
      sourceType: "EMAIL",
      parseError: extraction.error,
      attachmentCount: savedAttachments.length,
      triggeredBy: "manual",
    },
  });

  await db
    .update(mailboxMessages)
    .set({ invoiceId: updatedInvoice.id })
    .where(eq(mailboxMessages.id, message.id));

  if (existingProcessed) {
    await db
      .update(processedO365Messages)
      .set({ invoiceId: updatedInvoice.id, processedAt: new Date() })
      .where(eq(processedO365Messages.id, existingProcessed.id));
  } else {
    await db.insert(processedO365Messages).values({
      organizationId: params.organizationId,
      messageId: message.graphMessageId,
      invoiceId: updatedInvoice.id,
      processedAt: new Date(),
    });
  }

  const result = await db.query.invoices.findFirst({
    where: eq(invoices.id, updatedInvoice.id),
    with: { supplier: true, assignedTo: true, attachments: true },
  });

  return { invoice: result ?? updatedInvoice };
}
