import {
  buildSupplierFromEmailUserPrompt,
  SUPPLIER_FROM_EMAIL_SYSTEM_PROMPT,
} from "@/lib/extraction-prompts";
import { parseJsonContent } from "@/lib/extraction";
import type { MailboxMessage } from "@/lib/db";

export type ExtractedSupplierFromEmail = {
  company: string | null;
  senderEmail: string | null;
  contactName: string | null;
  domain: string | null;
};

const MAX_EMAIL_BODY_CHARS = 24_000;

function parseEmailList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function resolveEmailBody(message: MailboxMessage): string {
  if (message.bodyText?.trim()) {
    return message.bodyText.trim();
  }
  if (message.bodyHtml?.trim()) {
    return htmlToPlainText(message.bodyHtml);
  }
  return "";
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeDomain(value: unknown, senderEmail: string | null): string | null {
  const fromField = normalizeText(value)?.toLowerCase().replace(/^@/, "");
  if (fromField) return fromField;

  if (!senderEmail) return null;
  return senderEmail.split("@")[1]?.toLowerCase() ?? null;
}

export function normalizeExtractedSupplierFromEmail(
  raw: Partial<ExtractedSupplierFromEmail>,
): ExtractedSupplierFromEmail {
  const senderEmail = normalizeEmail(raw.senderEmail);
  return {
    company: normalizeText(raw.company),
    senderEmail,
    contactName: normalizeText(raw.contactName),
    domain: normalizeDomain(raw.domain, senderEmail),
  };
}

export async function extractSupplierFromEmail(
  message: MailboxMessage,
): Promise<{
  data: ExtractedSupplierFromEmail | null;
  raw: unknown;
  error?: string;
}> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    return {
      data: null,
      raw: null,
      error: "AI_GATEWAY_API_KEY is not configured",
    };
  }

  const body = resolveEmailBody(message).slice(0, MAX_EMAIL_BODY_CHARS);
  const receivedAt = message.receivedAt
    ? new Date(message.receivedAt).toISOString()
    : null;

  const userPrompt = buildSupplierFromEmailUserPrompt({
    fromName: message.fromName,
    fromEmail: message.fromEmail,
    toEmails: parseEmailList(message.toEmails),
    ccEmails: parseEmailList(message.ccEmails),
    subject: message.subject,
    receivedAt,
    body: body || "(No message body)",
  });

  const gatewayUrl =
    process.env.AI_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1/chat/completions";
  const model = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-4o-mini";

  try {
    const requestBody: Record<string, unknown> = {
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SUPPLIER_FROM_EMAIL_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    };

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
      const responseBody = await response.text();
      return {
        data: null,
        raw: responseBody,
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

    const parsed = normalizeExtractedSupplierFromEmail(
      JSON.parse(parseJsonContent(content)) as Partial<ExtractedSupplierFromEmail>,
    );

    return { data: parsed, raw: completion };
  } catch (error) {
    return {
      data: null,
      raw: null,
      error: error instanceof Error ? error.message : "Extraction failed",
    };
  }
}
