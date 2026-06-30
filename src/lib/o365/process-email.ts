import { and, eq } from "drizzle-orm";
import { readFile } from "fs/promises";
import { recordAuditEvent } from "@/lib/audit";
import { mergeLineItems, parseCsvLineItems } from "@/lib/csv-extraction";
import {
  db,
  invoiceAttachments,
  invoices,
  processedO365Messages,
} from "@/lib/db";
import {
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
      status: "PROCESSING",
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
    ? await extractInvoiceFromPdf(pdfAttachment.filePath, pdfAttachment.fileName)
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
      totalAmount: extraction.data?.totalAmount,
      currency: extraction.data?.currency ?? "AUD",
      lineItems: lineItems.length > 0 ? JSON.stringify(lineItems) : null,
      extractionCandidates: fieldCandidates
        ? JSON.stringify(fieldCandidates)
        : null,
      extractionRaw: extraction.raw ? JSON.stringify(extraction.raw) : null,
      parseError: extraction.error ?? null,
      supplierId: supplier?.id ?? null,
      status: extraction.error ? "NEEDS_REVIEW" : "PENDING_VALIDATION",
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
