import { callAiChatCompletion, type AiUsage } from "@/lib/ai-chat";
import { extractTextFromDocument } from "@/lib/document-text";
import {
  buildInvoiceExtractionFromEmailUserPrompt,
  buildInvoiceExtractionUserPrompt,
} from "@/lib/extraction-prompts";
import {
  resolveExtractionSystemPrompt,
  type SupplierExtractionContext,
} from "@/lib/supplier-extraction";

export type EmailExtractionContext = {
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  bodyText?: string | null;
};

export type ExtractedDocumentType =
  | "invoice"
  | "credit_note"
  | "statement"
  | "quote"
  | "other";

export type ExtractedInvoice = {
  documentType?: ExtractedDocumentType;
  vendorName?: string;
  vendorEmail?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  respondByDate?: string;
  totalAmount?: number;
  subtotal?: number;
  taxAmount?: number;
  currency?: string;
  accountReference?: string;
  confidence?: string;
  notes?: string;
};

const MAX_INVOICE_TEXT_CHARS = 24_000;

export type ExtractionDocumentText = {
  fileName: string;
  text: string;
};

export type ExtractionResult = {
  data: ExtractedInvoice | null;
  raw: unknown;
  usage?: AiUsage | null;
  model?: string | null;
  error?: string;
};

export async function extractTextFromPdf(filePath: string): Promise<string> {
  const { text } = await extractTextFromDocument(filePath, "invoice.pdf", "application/pdf");
  return text;
}

export async function extractInvoiceFromDocument(
  organizationId: string,
  filePath: string,
  fileName: string,
  mimeType: string,
  supplierContext?: SupplierExtractionContext | null,
  emailContext?: EmailExtractionContext | null,
): Promise<ExtractionResult> {
  let text: string;
  try {
    const extracted = await extractTextFromDocument(filePath, fileName, mimeType);
    text = extracted.text;
  } catch (error) {
    return {
      data: null,
      raw: null,
      error: error instanceof Error ? error.message : "Failed to read document",
    };
  }

  if (!text) {
    return {
      data: null,
      raw: null,
      error: "Document contains no extractable text",
    };
  }

  return extractInvoiceFromDocumentText(
    organizationId,
    fileName,
    text,
    supplierContext,
    emailContext,
  );
}

/**
 * Extracts one invoice from the combined text of every provided document
 * (e.g. the invoice PDF plus a CSV breakdown of the same charges) in a single
 * AI call, so the model reconciles header fields and totals across documents.
 */
export async function extractInvoiceFromDocumentTexts(
  organizationId: string,
  documents: ExtractionDocumentText[],
  supplierContext?: SupplierExtractionContext | null,
  emailContext?: EmailExtractionContext | null,
): Promise<ExtractionResult> {
  const usableDocuments = documents
    .map((document) => ({
      fileName: document.fileName,
      text: document.text.trim().slice(0, MAX_INVOICE_TEXT_CHARS),
    }))
    .filter((document) => document.text);

  if (usableDocuments.length === 0) {
    return {
      data: null,
      raw: null,
      error: "Document contains no extractable text",
    };
  }

  const systemPrompt = resolveExtractionSystemPrompt(supplierContext);
  const userPrompt = buildInvoiceExtractionUserPrompt(
    usableDocuments,
    emailContext ?? undefined,
  );

  return callExtractionAI({ organizationId, systemPrompt, userPrompt });
}

export async function extractInvoiceFromDocumentText(
  organizationId: string,
  fileName: string,
  text: string,
  supplierContext?: SupplierExtractionContext | null,
  emailContext?: EmailExtractionContext | null,
): Promise<ExtractionResult> {
  return extractInvoiceFromDocumentTexts(
    organizationId,
    [{ fileName, text }],
    supplierContext,
    emailContext,
  );
}

export async function extractInvoiceFromPdf(
  organizationId: string,
  filePath: string,
  fileName: string,
  supplierContext?: SupplierExtractionContext | null,
  emailContext?: EmailExtractionContext | null,
): Promise<ExtractionResult> {
  return extractInvoiceFromDocument(
    organizationId,
    filePath,
    fileName,
    "application/pdf",
    supplierContext,
    emailContext,
  );
}

export async function extractInvoiceFromEmailBody(
  organizationId: string,
  params: {
    subject?: string | null;
    fromEmail?: string | null;
    fromName?: string | null;
    bodyText: string;
    attachmentNames?: string[];
  },
  supplierContext?: SupplierExtractionContext | null,
): Promise<ExtractionResult> {
  const trimmedBody = params.bodyText.trim();
  if (!trimmedBody) {
    return {
      data: null,
      raw: null,
      error: "Email body is empty",
    };
  }

  const systemPrompt = resolveExtractionSystemPrompt(supplierContext);
  const userPrompt = buildInvoiceExtractionFromEmailUserPrompt({
    subject: params.subject,
    fromEmail: params.fromEmail,
    fromName: params.fromName,
    emailBody: trimmedBody.slice(0, MAX_INVOICE_TEXT_CHARS),
    attachmentNames: params.attachmentNames,
  });

  return callExtractionAI({ organizationId, systemPrompt, userPrompt });
}

async function callExtractionAI(params: {
  organizationId: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<ExtractionResult> {
  try {
    const result = await callAiChatCompletion(params);
    if ("error" in result) {
      return {
        data: null,
        raw: result.raw,
        error: result.error,
      };
    }

    const parsed = normalizeExtractedInvoice(
      JSON.parse(parseJsonContent(result.content)) as ExtractedInvoice,
    );

    return {
      data: parsed,
      raw: result.raw,
      usage: result.usage,
      model: result.model,
    };
  } catch (error) {
    return {
      data: null,
      raw: null,
      error: error instanceof Error ? error.message : "Extraction failed",
    };
  }
}

export function parseInvoiceDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseJsonContent(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

const DOCUMENT_TYPES: ReadonlySet<ExtractedDocumentType> = new Set([
  "invoice",
  "credit_note",
  "statement",
  "quote",
  "other",
]);

function normalizeDocumentType(value: unknown): ExtractedDocumentType | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return DOCUMENT_TYPES.has(normalized as ExtractedDocumentType)
    ? (normalized as ExtractedDocumentType)
    : undefined;
}

const MAX_ACCOUNT_REFERENCE_CHARS = 200;

// The model occasionally returns numeric account identifiers as JSON numbers.
function normalizeAccountReference(value: unknown): string | undefined {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "";
  const trimmed = text.trim().slice(0, MAX_ACCOUNT_REFERENCE_CHARS).trim();
  return trimmed || undefined;
}

export function normalizeExtractedInvoice(raw: ExtractedInvoice): ExtractedInvoice {
  return {
    documentType: normalizeDocumentType(raw.documentType),
    vendorName: raw.vendorName?.trim() || undefined,
    vendorEmail: raw.vendorEmail?.trim() || undefined,
    invoiceNumber: raw.invoiceNumber?.trim() || undefined,
    invoiceDate: raw.invoiceDate ?? undefined,
    dueDate: raw.dueDate ?? undefined,
    respondByDate: raw.respondByDate ?? undefined,
    totalAmount: toNumber(raw.totalAmount),
    subtotal: toNumber(raw.subtotal),
    taxAmount: toNumber(raw.taxAmount),
    currency: raw.currency?.trim().toUpperCase() || "AUD",
    accountReference: normalizeAccountReference(raw.accountReference),
    confidence: raw.confidence ?? undefined,
    notes: raw.notes?.trim() || undefined,
  };
}
