import { readFile } from "fs/promises";
import pdf from "pdf-parse";
import { getUploadAbsolutePath } from "@/lib/uploads";

export type ExtractedLineItem = {
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  reference?: string;
};

export type ExtractedInvoice = {
  vendorName?: string;
  vendorEmail?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  totalAmount?: number;
  currency?: string;
  lineItems: ExtractedLineItem[];
  confidence?: string;
  notes?: string;
};

const EXTRACTION_SCHEMA = `{
  "vendorName": "string",
  "vendorEmail": "string or null",
  "invoiceNumber": "string or null",
  "invoiceDate": "ISO date string or null",
  "totalAmount": "number",
  "currency": "3-letter code, default AUD",
  "lineItems": [
    {
      "description": "string",
      "quantity": "number or null",
      "unitPrice": "number or null",
      "amount": "number or null",
      "reference": "consignment or reference id or null"
    }
  ],
  "confidence": "high | medium | low",
  "notes": "any extraction caveats"
}`;

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

  const prompt = `You are an invoice extraction assistant for a transport company accounts team.
Extract structured data from the invoice text below.

Return ONLY valid JSON matching this schema:
${EXTRACTION_SCHEMA}

File name: ${fileName}

Invoice text:
"""
${text.slice(0, 12000)}
"""`;

  try {
    const requestBody: Record<string, unknown> = {
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You extract invoice data accurately. Respond with JSON only, no markdown.",
        },
        { role: "user", content: prompt },
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

    const parsed = JSON.parse(parseJsonContent(content)) as ExtractedInvoice;
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
