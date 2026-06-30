import { readFile } from "fs/promises";
import pdf from "pdf-parse";
import { getUploadAbsolutePath } from "@/lib/uploads";
import {
  buildInvoiceExtractionUserPrompt,
  INVOICE_EXTRACTION_SYSTEM_PROMPT,
} from "@/lib/extraction-prompts";

export type ExtractedLineItem = {
  lineNumber?: number;
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  reference?: string;
  serviceType?: string;
};

export type ExtractedInvoice = {
  vendorName?: string;
  vendorEmail?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  totalAmount?: number;
  subtotal?: number;
  taxAmount?: number;
  currency?: string;
  lineItems: ExtractedLineItem[];
  confidence?: string;
  notes?: string;
};

const MAX_INVOICE_TEXT_CHARS = 24_000;

export async function extractTextFromPdf(filePath: string): Promise<string> {
  const absolutePath = getUploadAbsolutePath(filePath);
  const buffer = await readFile(absolutePath);
  const parsed = await pdf(buffer);
  return parsed.text.trim();
}

export async function extractInvoiceFromPdf(
  filePath: string,
  fileName: string,
): Promise<{ data: ExtractedInvoice | null; raw: unknown; error?: string }> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    return {
      data: null,
      raw: null,
      error: "AI_GATEWAY_API_KEY is not configured",
    };
  }

  let text: string;
  try {
    text = await extractTextFromPdf(filePath);
  } catch (error) {
    return {
      data: null,
      raw: null,
      error: error instanceof Error ? error.message : "Failed to read PDF",
    };
  }

  if (!text) {
    return {
      data: null,
      raw: null,
      error: "PDF contains no extractable text",
    };
  }

  const gatewayUrl =
    process.env.AI_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1/chat/completions";
  const model = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-4o-mini";

  const userPrompt = buildInvoiceExtractionUserPrompt(
    fileName,
    text.slice(0, MAX_INVOICE_TEXT_CHARS),
  );

  try {
    const requestBody: Record<string, unknown> = {
      model,
      temperature: 0,
      messages: [
        { role: "system", content: INVOICE_EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    };

    // Vercel AI Gateway rejects response_format on some models; OpenAI direct accepts it.
    if (!gatewayUrl.includes("ai-gateway.vercel.sh")) {
      requestBody.response_format = { type: "json_object" };
    }

    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        data: null,
        raw: body,
        error: `AI Gateway error (${response.status})`,
      };
    }

    const completion = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return {
        data: null,
        raw: completion,
        error: "AI Gateway returned an empty response",
      };
    }

    const parsed = normalizeExtractedInvoice(
      JSON.parse(parseJsonContent(content)) as ExtractedInvoice,
    );

    if (parsed.lineItems.length === 0) {
      parsed.notes = [parsed.notes, "No line items were extracted — manual review required."]
        .filter(Boolean)
        .join(" ");
      parsed.confidence = parsed.confidence ?? "low";
    }

    return { data: parsed, raw: completion };
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

function parseJsonContent(content: string) {
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

function normalizeLineItem(raw: Record<string, unknown>, index: number): ExtractedLineItem | null {
  const description =
    typeof raw.description === "string"
      ? raw.description.trim()
      : typeof raw.chargeDescription === "string"
        ? raw.chargeDescription.trim()
        : "";

  if (!description) return null;

  const lineNumber = toNumber(raw.lineNumber) ?? index + 1;
  const amount = toNumber(raw.amount) ?? toNumber(raw.lineTotal) ?? toNumber(raw.total);

  return {
    lineNumber: Number.isInteger(lineNumber) ? lineNumber : index + 1,
    description,
    quantity: toNumber(raw.quantity),
    unitPrice: toNumber(raw.unitPrice) ?? toNumber(raw.unit_price),
    amount,
    reference:
      typeof raw.reference === "string"
        ? raw.reference.trim() || undefined
        : typeof raw.consignmentNumber === "string"
          ? raw.consignmentNumber.trim() || undefined
          : typeof raw.consignment === "string"
            ? raw.consignment.trim() || undefined
            : undefined,
    serviceType:
      typeof raw.serviceType === "string"
        ? raw.serviceType.trim() || undefined
        : typeof raw.service === "string"
          ? raw.service.trim() || undefined
          : undefined,
  };
}

export function normalizeExtractedInvoice(raw: ExtractedInvoice): ExtractedInvoice {
  const lineItemsSource = Array.isArray(raw.lineItems) ? raw.lineItems : [];

  const lineItems = lineItemsSource
    .map((item, index) =>
      normalizeLineItem(item as unknown as Record<string, unknown>, index),
    )
    .filter((item): item is ExtractedLineItem => item !== null)
    .sort((a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0));

  return {
    vendorName: raw.vendorName?.trim() || undefined,
    vendorEmail: raw.vendorEmail?.trim() || undefined,
    invoiceNumber: raw.invoiceNumber?.trim() || undefined,
    invoiceDate: raw.invoiceDate ?? undefined,
    dueDate: raw.dueDate ?? undefined,
    totalAmount: toNumber(raw.totalAmount),
    subtotal: toNumber(raw.subtotal),
    taxAmount: toNumber(raw.taxAmount),
    currency: raw.currency?.trim().toUpperCase() || "AUD",
    lineItems,
    confidence: raw.confidence ?? undefined,
    notes: raw.notes?.trim() || undefined,
  };
}
