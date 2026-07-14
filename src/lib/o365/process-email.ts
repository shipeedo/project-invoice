import { and, eq } from "drizzle-orm";
import { readFile } from "fs/promises";
import { recordAuditEvent } from "@/lib/audit";
import {
  isInvoiceLikeAttachment,
  isPdfAttachment,
  isSpreadsheetAttachment,
  pickPrimaryInvoiceAttachment,
} from "@/lib/attachment-types";
import { extractTextFromDocument } from "@/lib/document-text";
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
  classificationAllowsInvoiceProcessing,
  classifyInboundEmail,
} from "@/lib/email-classification";
import { recordEmailProcessingOutcome } from "@/lib/o365/email-audit";
import { findDuplicateSupplierInvoice } from "@/lib/o365/invoice-duplicates";
import {
  emailHasProcessableInvoiceSource,
  fetchPortalInvoicePdfAttachment,
} from "@/lib/invoice-portals";
import { documentLooksLikeAccountStatement, emailLooksLikeAccountStatement } from "@/lib/invoice-portals/detect-account-statement";
import {
  extractInvoiceFromDocumentTexts,
  extractInvoiceFromEmailBody,
  parseInvoiceDate,
  type ExtractionDocumentText,
} from "@/lib/extraction";
import { ensureDefaultRoutingRules } from "@/lib/routing";
import { resolveDueDate } from "@/lib/trading-terms";
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

type EmailBodyContent = {
  html: string | null;
  text: string | null;
};

export type SavedAttachment = {
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
  isPrimary: boolean;
};

export type EmailContext = {
  messageId: string;
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  receivedAt?: Date | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
};

type ProcessEmailOptions = {
  organizationId: string;
  email: EmailContext;
  attachments: EmailAttachmentInput[];
  emailBody?: EmailBodyContent;
  supplierHintId?: string | null;
  triggeredBy?: "sync" | "manual" | "background" | "queue";
  mailboxMessageId?: string;
};

function extractEmailBody(message: GraphMessage): EmailBodyContent {
  const content = message.body?.content ?? "";
  const contentType = message.body?.contentType?.toLowerCase();

  if (contentType === "html" && content) {
    return { html: content, text: null };
  }

  if (content) {
    return { html: null, text: content };
  }

  return { html: null, text: message.bodyPreview ?? null };
}

function resolveEmailBodyText(emailBody: EmailBodyContent) {
  return emailBody.text?.trim() || (emailBody.html ? htmlToPlainText(emailBody.html) : null);
}

async function appendPortalPdfIfNeeded(params: {
  savedAttachments: SavedAttachment[];
  emailBody: EmailBodyContent;
}) {
  const hasPdfAttachment = params.savedAttachments.some((attachment) =>
    isPdfAttachment(attachment.fileName, attachment.mimeType),
  );
  if (hasPdfAttachment) {
    return { portalFetchError: null as string | null, portalSourceUrl: null as string | null };
  }

  const outcome = await fetchPortalInvoicePdfAttachment({
    bodyHtml: params.emailBody.html,
    bodyText: params.emailBody.text,
  });

  if (!outcome) {
    return { portalFetchError: null, portalSourceUrl: null };
  }

  if ("error" in outcome) {
    return { portalFetchError: outcome.error, portalSourceUrl: outcome.sourceUrl };
  }

  params.savedAttachments.push(outcome.attachment);
  return { portalFetchError: null, portalSourceUrl: outcome.attachment.sourceUrl };
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

async function saveAttachmentInputs(attachments: EmailAttachmentInput[]) {
  const savedAttachments: SavedAttachment[] = [];

  for (const attachment of attachments) {
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

  return savedAttachments;
}

function markPrimaryAttachment(
  savedAttachments: SavedAttachment[],
  primary: SavedAttachment | null,
) {
  for (const attachment of savedAttachments) {
    attachment.isPrimary = primary != null && attachment === primary;
  }
}

export async function runInvoiceExtraction(params: {
  organizationId: string;
  savedAttachments: SavedAttachment[];
  emailContext: EmailContext;
  supplierId?: string | null;
  skipStatementDetection?: boolean;
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

  const emailBody: EmailBodyContent = {
    html: params.emailContext.bodyHtml ?? null,
    text: params.emailContext.bodyText ?? null,
  };

  const { portalFetchError, portalSourceUrl } = await appendPortalPdfIfNeeded({
    savedAttachments: params.savedAttachments,
    emailBody,
  });

  const primarySelection = pickPrimaryInvoiceAttachment(params.savedAttachments);
  const primaryAttachment = primarySelection?.attachment ?? null;
  markPrimaryAttachment(params.savedAttachments, primaryAttachment);

  const supplierContext = params.supplierId
    ? await getSupplierExtractionContext(params.organizationId, params.supplierId)
    : null;

  const customSupplierContext =
    supplierContext && supplierHasCustomExtraction(supplierContext)
      ? supplierContext
      : undefined;

  let accountStatement = false;
  let accountStatementNote: string | null = null;
  let extraction: Awaited<ReturnType<typeof extractInvoiceFromDocumentTexts>> = {
    data: null,
    raw: null,
    error: portalFetchError ?? "No supported invoice attachment or email body to extract from",
  };

  if (primaryAttachment) {
    try {
      const { text } = await extractTextFromDocument(
        primaryAttachment.filePath,
        primaryAttachment.fileName,
        primaryAttachment.mimeType,
      );

      if (!params.skipStatementDetection && documentLooksLikeAccountStatement(text)) {
        accountStatement = true;
        accountStatementNote = `Attachment "${primaryAttachment.fileName}" is an account statement, not an invoice`;
        extraction = {
          data: null,
          raw: null,
          error: "Account statement detected in attachment",
        };
      } else {
        // Spreadsheet attachments usually itemise the same invoice's charges,
        // so they go to the AI alongside the primary document in a single call
        // and the model can confirm header fields and totals across documents.
        const documents: ExtractionDocumentText[] = [
          { fileName: primaryAttachment.fileName, text },
        ];
        for (const attachment of params.savedAttachments) {
          if (attachment.filePath === primaryAttachment.filePath) continue;
          if (!isSpreadsheetAttachment(attachment.fileName, attachment.mimeType)) {
            continue;
          }
          try {
            const extra = await extractTextFromDocument(
              attachment.filePath,
              attachment.fileName,
              attachment.mimeType,
            );
            documents.push({ fileName: attachment.fileName, text: extra.text });
          } catch {
            // An unreadable side document must not block extraction from the
            // primary attachment.
          }
        }

        extraction = await extractInvoiceFromDocumentTexts(
          params.organizationId,
          documents,
          customSupplierContext,
          emailContextForPdf,
        );
      }
    } catch (error) {
      extraction = {
        data: null,
        raw: null,
        error: error instanceof Error ? error.message : "Failed to read attachment",
      };
    }
  } else if (bodyText) {
    extraction = await extractInvoiceFromEmailBody(
      params.organizationId,
      {
        subject: params.emailContext.subject,
        fromEmail: params.emailContext.fromEmail,
        fromName: params.emailContext.fromName,
        bodyText,
        attachmentNames: params.savedAttachments.map((attachment) => attachment.fileName),
      },
      customSupplierContext,
    );
  }

  if (
    !params.skipStatementDetection &&
    !accountStatement &&
    extraction.data?.documentType === "statement"
  ) {
    accountStatement = true;
    accountStatementNote = primaryAttachment
      ? `Extraction classified attachment "${primaryAttachment.fileName}" as an account statement, not an invoice`
      : "Extraction classified the email content as an account statement, not an invoice";
  }

  const senderEmail = params.emailContext.fromEmail;

  let resolvedSupplier = params.supplierId
    ? ((await db.query.suppliers.findFirst({
        where: and(
          eq(suppliers.id, params.supplierId),
          eq(suppliers.organizationId, params.organizationId),
        ),
      })) ?? null)
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

  return {
    extraction,
    primaryAttachment,
    supplier: resolvedSupplier,
    portalFetchError,
    portalSourceUrl,
    accountStatement,
    accountStatementNote,
  };
}

async function ignoreInboundEmail(params: {
  organizationId: string;
  email: EmailContext;
  ignoreReason:
    | "already_processed"
    | "no_invoice_detected"
    | "not_an_invoice"
    | "account_statement"
    | "duplicate_invoice";
  note?: string | null;
  duplicateInvoiceId?: string | null;
  triggeredBy?: "sync" | "manual" | "background" | "queue";
}) {
  await recordEmailProcessingOutcome({
    organizationId: params.organizationId,
    messageId: params.email.messageId,
    subject: params.email.subject,
    fromEmail: params.email.fromEmail,
    outcome: "ignored",
    ignoreReason: params.ignoreReason,
    note: params.note,
    duplicateInvoiceId: params.duplicateInvoiceId,
    triggeredBy: params.triggeredBy,
  });

  return {
    skipped: true as const,
    reason: params.ignoreReason,
    duplicateInvoiceId: params.duplicateInvoiceId,
  };
}

export async function processInboundEmailForInvoice(params: ProcessEmailOptions) {
  const existing = await db.query.processedO365Messages.findFirst({
    where: and(
      eq(processedO365Messages.organizationId, params.organizationId),
      eq(processedO365Messages.messageId, params.email.messageId),
    ),
  });

  if (existing) {
    return { skipped: true as const, reason: "already_processed" as const };
  }

  const emailBody =
    params.emailBody ??
    ({
      html: params.email.bodyHtml ?? null,
      text: params.email.bodyText ?? null,
    } satisfies EmailBodyContent);

  const bodyText = resolveEmailBodyText(emailBody);
  const emailContext: EmailContext = {
    ...params.email,
    bodyText: params.email.bodyText ?? bodyText,
    bodyHtml: params.email.bodyHtml ?? emailBody.html,
  };

  const attachmentFileNames = params.attachments.map((attachment) => attachment.fileName);
  const isManual = params.triggeredBy === "manual";

  if (
    !isManual &&
    emailLooksLikeAccountStatement({
      subject: emailContext.subject,
      bodyHtml: emailContext.bodyHtml,
      bodyText: emailContext.bodyText,
      attachmentFileNames,
    })
  ) {
    return ignoreInboundEmail({
      organizationId: params.organizationId,
      email: emailContext,
      ignoreReason: "account_statement",
      note: "Email subject, body, or attachment names indicate an account statement, not an invoice",
      triggeredBy: params.triggeredBy,
    });
  }

  const hasProcessableSource = isManual
    ? params.attachments.length > 0 ||
      Boolean(emailContext.bodyText?.trim()) ||
      Boolean(emailContext.bodyHtml?.trim())
    : emailHasProcessableInvoiceSource({
        attachmentCount: params.attachments.filter((attachment) =>
          isInvoiceLikeAttachment(attachment.fileName, attachment.mimeType),
        ).length,
        attachmentFileNames,
        subject: emailContext.subject,
        bodyHtml: emailContext.bodyHtml,
        bodyText: emailContext.bodyText,
      });

  if (!hasProcessableSource) {
    return ignoreInboundEmail({
      organizationId: params.organizationId,
      email: emailContext,
      ignoreReason: "no_invoice_detected",
      triggeredBy: params.triggeredBy,
    });
  }

  let classification: Awaited<ReturnType<typeof classifyInboundEmail>> = null;
  if (!isManual) {
    classification = await classifyInboundEmail({
      organizationId: params.organizationId,
      subject: emailContext.subject,
      fromEmail: emailContext.fromEmail,
      fromName: emailContext.fromName,
      bodyText: emailContext.bodyText,
      bodyHtml: emailContext.bodyHtml,
      attachmentNames: attachmentFileNames,
    });

    if (!classificationAllowsInvoiceProcessing(classification)) {
      return ignoreInboundEmail({
        organizationId: params.organizationId,
        email: emailContext,
        ignoreReason: "not_an_invoice",
        note: [
          `Email classified as ${classification?.category.replace(/_/g, " ")}, not an invoice`,
          classification?.reason,
        ]
          .filter(Boolean)
          .join(": "),
        triggeredBy: params.triggeredBy,
      });
    }
  }

  await ensureDefaultRoutingRules(params.organizationId);

  const savedAttachments = await saveAttachmentInputs(params.attachments);

  const { extraction, primaryAttachment, supplier, portalFetchError, portalSourceUrl, accountStatement, accountStatementNote } =
    await runInvoiceExtraction({
      organizationId: params.organizationId,
      savedAttachments,
      emailContext,
      supplierId: params.supplierHintId,
      skipStatementDetection: isManual,
    });

  if (!isManual && accountStatement) {
    return ignoreInboundEmail({
      organizationId: params.organizationId,
      email: emailContext,
      ignoreReason: "account_statement",
      note:
        accountStatementNote ??
        "Attachment detected as an account statement, not an invoice",
      triggeredBy: params.triggeredBy,
    });
  }

  const invoiceDate = parseInvoiceDate(extraction.data?.invoiceDate);
  const resolvedSupplierId = supplier?.id ?? params.supplierHintId ?? null;
  const resolvedDueDate = resolveDueDate({
    invoiceDate,
    extractedDueDate: parseInvoiceDate(extraction.data?.dueDate),
    tradingTermDays: supplier?.tradingTermDays,
  });

  if (resolvedSupplierId) {
    const duplicate = await findDuplicateSupplierInvoice({
      organizationId: params.organizationId,
      supplierId: resolvedSupplierId,
      invoiceNumber: extraction.data?.invoiceNumber,
      invoiceDate,
      totalAmount: extraction.data?.totalAmount,
    });

    if (duplicate) {
      return ignoreInboundEmail({
        organizationId: params.organizationId,
        email: emailContext,
        ignoreReason: "duplicate_invoice",
        duplicateInvoiceId: duplicate.id,
        triggeredBy: params.triggeredBy,
      });
    }
  }

  const receivedAt = emailContext.receivedAt ?? new Date();

  const [invoice] = await db
    .insert(invoices)
    .values({
      organizationId: params.organizationId,
      status: "DRAFT",
      sourceType: "EMAIL",
      sourceMessageId: emailContext.messageId,
      emailSubject: emailContext.subject ?? null,
      emailFrom: emailContext.fromEmail,
      emailFromName: emailContext.fromName,
      emailReceivedAt: receivedAt,
      emailBodyHtml: emailContext.bodyHtml,
      emailBodyText: emailContext.bodyText,
      vendorEmail: emailContext.fromEmail,
      supplierId: resolvedSupplierId,
    })
    .returning();

  await recordAuditEvent({
    invoiceId: invoice.id,
    action: "invoice.received",
    details: {
      sourceType: "EMAIL",
      messageId: emailContext.messageId,
      subject: emailContext.subject,
      triggeredBy: params.triggeredBy,
      ...(classification
        ? {
            classification: {
              category: classification.category,
              confidence: classification.confidence,
              reason: classification.reason,
            },
          }
        : {}),
    },
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
      vendorName: extraction.data?.vendorName,
      vendorEmail: extraction.data?.vendorEmail ?? emailContext.fromEmail,
      invoiceNumber: extraction.data?.invoiceNumber,
      invoiceDate,
      dueDate: resolvedDueDate.dueDate,
      originalDueDate: resolvedDueDate.originalDueDate,
      respondByDate: parseInvoiceDate(extraction.data?.respondByDate),
      totalAmount: extraction.data?.totalAmount,
      subtotalAmount: extraction.data?.subtotal,
      taxAmount: extraction.data?.taxAmount,
      currency: extraction.data?.currency ?? "AUD",
      accountReference: extraction.data?.accountReference ?? null,
      extractionRaw: extraction.raw ? JSON.stringify(extraction.raw) : null,
      parseError: extraction.error ?? portalFetchError ?? null,
      supplierId: resolvedSupplierId,
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
      parseError: extraction.error ?? portalFetchError,
      attachmentCount: savedAttachments.length,
      portalSourceUrl,
      triggeredBy: params.triggeredBy,
    },
  });

  if (resolvedDueDate.overridden) {
    await recordAuditEvent({
      invoiceId: invoice.id,
      action: "invoice.due_date_overridden",
      details: {
        supplierId: resolvedSupplierId,
        tradingTermDays: resolvedDueDate.tradingTermDays,
        originalDueDate: resolvedDueDate.originalDueDate?.toISOString() ?? null,
        dueDate: resolvedDueDate.dueDate?.toISOString() ?? null,
      },
    });
  }

  await recordEmailProcessingOutcome({
    organizationId: params.organizationId,
    messageId: emailContext.messageId,
    subject: emailContext.subject,
    fromEmail: emailContext.fromEmail,
    outcome: "created",
    invoiceId: updatedInvoice.id,
    triggeredBy: params.triggeredBy,
  });

  if (params.mailboxMessageId) {
    await db
      .update(mailboxMessages)
      .set({ invoiceId: updatedInvoice.id })
      .where(eq(mailboxMessages.id, params.mailboxMessageId));
  }

  const result = await db.query.invoices.findFirst({
    where: eq(invoices.id, updatedInvoice.id),
    with: { supplier: true, assignedTo: true, attachments: true },
  });

  return {
    skipped: false as const,
    invoice: result ?? updatedInvoice,
    usage: extraction.usage ?? null,
    model: extraction.model ?? null,
  };
}

export async function processEmailInvoice(params: {
  organizationId: string;
  message: GraphMessage;
  attachments: EmailAttachmentInput[];
  emailBody?: EmailBodyContent;
  supplierHintId?: string | null;
  triggeredBy?: "sync" | "manual" | "background" | "queue";
  mailboxMessageId?: string;
}) {
  const emailBody = params.emailBody ?? extractEmailBody(params.message);

  return processInboundEmailForInvoice({
    organizationId: params.organizationId,
    email: {
      messageId: params.message.id,
      subject: params.message.subject,
      fromEmail: params.message.from?.emailAddress?.address?.trim() || null,
      fromName: params.message.from?.emailAddress?.name?.trim() || null,
      receivedAt: params.message.receivedDateTime
        ? new Date(params.message.receivedDateTime)
        : new Date(),
      bodyHtml: emailBody.html,
      bodyText: emailBody.text,
    },
    attachments: params.attachments,
    emailBody,
    supplierHintId: params.supplierHintId,
    triggeredBy: params.triggeredBy,
    mailboxMessageId: params.mailboxMessageId,
  });
}

/**
 * Runs the invoice pipeline for a message already synced to the database,
 * reading attachments from local uploads instead of Microsoft Graph. Manual
 * triggers skip the classifier/statement gates; queued ones keep them.
 */
export async function processStoredMailboxMessage(params: {
  organizationId: string;
  messageId: string;
  triggeredBy?: "sync" | "manual" | "background" | "queue";
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

  if (message.invoiceId) {
    return {
      error: "An invoice has already been created from this message" as const,
      invoiceId: message.invoiceId,
    };
  }

  const fileAttachments = message.attachments.filter((attachment) => !attachment.isInline);
  const bodyText =
    message.bodyText?.trim() ||
    (message.bodyHtml ? htmlToPlainText(message.bodyHtml) : null);

  const outcome = await processInboundEmailForInvoice({
    organizationId: params.organizationId,
    email: {
      messageId: message.graphMessageId,
      subject: message.subject,
      fromEmail: message.fromEmail,
      fromName: message.fromName,
      receivedAt: message.receivedAt,
      bodyHtml: message.bodyHtml,
      bodyText: message.bodyText ?? bodyText,
    },
    attachments: await Promise.all(
      fileAttachments.map(async (attachment) => ({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType ?? "application/octet-stream",
        size: attachment.size ?? 0,
        buffer: await readFile(getUploadAbsolutePath(attachment.filePath)),
      })),
    ),
    supplierHintId: message.supplierId,
    triggeredBy: params.triggeredBy ?? "manual",
    mailboxMessageId: message.id,
  });

  return { outcome };
}

export async function processMailboxMessageInvoice(params: {
  organizationId: string;
  messageId: string;
}) {
  const result = await processStoredMailboxMessage({
    organizationId: params.organizationId,
    messageId: params.messageId,
    triggeredBy: "manual",
  });

  if (result.error) {
    return { error: result.error, invoiceId: result.invoiceId };
  }

  const { outcome } = result;
  if (!outcome) {
    return { error: "Message not found" as const };
  }

  if (outcome.skipped) {
    if (outcome.reason === "duplicate_invoice" && outcome.duplicateInvoiceId) {
      return {
        error: "An invoice with the same details already exists for this supplier" as const,
        invoiceId: outcome.duplicateInvoiceId,
      };
    }

    if (outcome.reason === "no_invoice_detected") {
      return {
        error: "No invoice detected in the email body, attachments, or portal links" as const,
      };
    }

    return { error: "This message has already been processed" as const };
  }

  return { invoice: outcome.invoice };
}
