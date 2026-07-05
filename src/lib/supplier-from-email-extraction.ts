import {
  buildSupplierFromEmailUserPrompt,
  SUPPLIER_FROM_EMAIL_SYSTEM_PROMPT,
  type SupplierFromEmailThreadMessage,
} from "@/lib/extraction-prompts";
import { callAiChatCompletion } from "@/lib/ai-chat";
import {
  isForwardedEmailBody,
  resolvePlainEmailBody,
  splitEmailThread,
} from "@/lib/email-body";
import { parseJsonContent } from "@/lib/extraction";
import type { MailboxMessage } from "@/lib/db";

export type ExtractedSupplierFromEmail = {
  company: string | null;
  senderEmail: string | null;
  contactName: string | null;
  domain: string | null;
};

export type SupplierFromEmailCandidate = ExtractedSupplierFromEmail & {
  label: string;
  source: string;
  confidence: "high" | "medium" | "low";
  reasoning: string | null;
};

export type ExtractedSuppliersFromEmailThread = {
  candidates: SupplierFromEmailCandidate[];
  recommendedIndex: number;
};

const MAX_THREAD_CHARS = 48_000;

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

function resolveEmailBody(message: MailboxMessage): string {
  return resolvePlainEmailBody({
    bodyHtml: message.bodyHtml,
    bodyText: message.bodyText,
  });
}

function expandMessageIntoThreadParts(
  message: MailboxMessage,
  body: string,
): SupplierFromEmailThreadMessage[] {
  if (!isForwardedEmailBody(body)) {
    return [
      {
        id: message.id,
        direction: message.direction,
        fromName: message.fromName,
        fromEmail: message.fromEmail,
        toEmails: parseEmailList(message.toEmails),
        ccEmails: parseEmailList(message.ccEmails),
        subject: message.subject,
        receivedAt: message.receivedAt
          ? new Date(message.receivedAt).toISOString()
          : null,
        body: body || "(No message body)",
      },
    ];
  }

  const parts = splitEmailThread(body);
  if (parts.length <= 1) {
    return [
      {
        id: message.id,
        direction: message.direction,
        fromName: message.fromName,
        fromEmail: message.fromEmail,
        toEmails: parseEmailList(message.toEmails),
        ccEmails: parseEmailList(message.ccEmails),
        subject: message.subject,
        receivedAt: message.receivedAt
          ? new Date(message.receivedAt).toISOString()
          : null,
        body: body || "(No message body)",
      },
    ];
  }

  return parts.map((part, index) => ({
    id: `${message.id}:part-${index}`,
    direction: message.direction,
    fromName:
      part.source === "wrapper" ? message.fromName : part.fromName ?? message.fromName,
    fromEmail:
      part.source === "wrapper" ? message.fromEmail : part.fromEmail ?? message.fromEmail,
    toEmails:
      part.source === "wrapper"
        ? parseEmailList(message.toEmails)
        : part.toEmails.length > 0
          ? part.toEmails
          : parseEmailList(message.toEmails),
    ccEmails:
      part.source === "wrapper"
        ? parseEmailList(message.ccEmails)
        : part.ccEmails.length > 0
          ? part.ccEmails
          : parseEmailList(message.ccEmails),
    subject:
      part.source === "wrapper"
        ? message.subject
        : part.subject ?? message.subject,
    receivedAt:
      part.source === "wrapper"
        ? message.receivedAt
          ? new Date(message.receivedAt).toISOString()
          : null
        : part.date ?? (message.receivedAt
          ? new Date(message.receivedAt).toISOString()
          : null),
    body: part.body || "(No message body)",
  }));
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

function normalizeConfidence(value: unknown): SupplierFromEmailCandidate["confidence"] {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
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

function normalizeCandidate(raw: Record<string, unknown>): SupplierFromEmailCandidate | null {
  const fields = normalizeExtractedSupplierFromEmail(raw);
  if (!fields.company && !fields.senderEmail) return null;

  return {
    ...fields,
    label: normalizeText(raw.label) ?? fields.company ?? fields.senderEmail ?? "Supplier",
    source: normalizeText(raw.source) ?? "other",
    confidence: normalizeConfidence(raw.confidence),
    reasoning: normalizeText(raw.reasoning),
  };
}

function buildThreadMessages(
  messages: MailboxMessage[],
  focusMessageId?: string,
): SupplierFromEmailThreadMessage[] {
  const sorted = [...messages].sort((left, right) => {
    const leftTime = left.receivedAt?.getTime() ?? 0;
    const rightTime = right.receivedAt?.getTime() ?? 0;
    return leftTime - rightTime;
  });

  let remainingChars = MAX_THREAD_CHARS;
  const threadMessages: SupplierFromEmailThreadMessage[] = [];

  for (const message of sorted) {
    if (remainingChars <= 0) break;

    const body = resolveEmailBody(message);
    const expanded = expandMessageIntoThreadParts(message, body);

    for (const part of expanded) {
      if (remainingChars <= 0) break;

      const partBody = part.body.slice(0, remainingChars);
      remainingChars -= partBody.length;

      threadMessages.push({
        ...part,
        body: partBody || "(No message body)",
      });
    }
  }

  if (focusMessageId && !threadMessages.some((message) => message.id.startsWith(focusMessageId))) {
    const focusMessage = sorted.find((message) => message.id === focusMessageId);
    if (focusMessage) {
      const expanded = expandMessageIntoThreadParts(
        focusMessage,
        resolveEmailBody(focusMessage),
      );

      for (const part of expanded) {
        threadMessages.push({
          ...part,
          body: part.body.slice(0, MAX_THREAD_CHARS) || "(No message body)",
        });
      }
    }
  }

  return threadMessages;
}

export function normalizeExtractedSuppliersFromEmailThread(
  raw: Record<string, unknown>,
): ExtractedSuppliersFromEmailThread {
  if (Array.isArray(raw.candidates)) {
    const candidates = raw.candidates
      .map((entry) =>
        entry && typeof entry === "object"
          ? normalizeCandidate(entry as Record<string, unknown>)
          : null,
      )
      .filter((entry): entry is SupplierFromEmailCandidate => entry !== null);

    if (candidates.length > 0) {
      const recommendedIndex =
        typeof raw.recommendedIndex === "number" &&
        raw.recommendedIndex >= 0 &&
        raw.recommendedIndex < candidates.length
          ? raw.recommendedIndex
          : 0;

      return { candidates, recommendedIndex };
    }
  }

  const legacy = normalizeExtractedSupplierFromEmail(raw);
  if (legacy.company || legacy.senderEmail) {
    return {
      candidates: [
        {
          ...legacy,
          label: legacy.company ?? legacy.senderEmail ?? "Supplier",
          source: "email_sender",
          confidence: "medium",
          reasoning: null,
        },
      ],
      recommendedIndex: 0,
    };
  }

  return { candidates: [], recommendedIndex: 0 };
}

export async function extractSupplierFromEmailThread(params: {
  messages: MailboxMessage[];
  focusMessageId?: string;
}): Promise<{
  data: ExtractedSuppliersFromEmailThread | null;
  raw: unknown;
  error?: string;
}> {
  if (params.messages.length === 0) {
    return {
      data: null,
      raw: null,
      error: "No messages in thread",
    };
  }

  const threadMessages = buildThreadMessages(params.messages, params.focusMessageId);
  const userPrompt = buildSupplierFromEmailUserPrompt({
    messages: threadMessages,
    focusMessageId: params.focusMessageId,
  });

  try {
    const result = await callAiChatCompletion({
      systemPrompt: SUPPLIER_FROM_EMAIL_SYSTEM_PROMPT,
      userPrompt,
    });

    if ("error" in result) {
      return {
        data: null,
        raw: result.raw,
        error: result.error,
      };
    }

    const parsed = normalizeExtractedSuppliersFromEmailThread(
      JSON.parse(parseJsonContent(result.content)) as Record<string, unknown>,
    );

    if (parsed.candidates.length === 0) {
      return {
        data: null,
        raw: result.raw,
        error: "AI could not identify any supplier candidates in this thread",
      };
    }

    return { data: parsed, raw: result.raw };
  } catch (error) {
    return {
      data: null,
      raw: null,
      error: error instanceof Error ? error.message : "Extraction failed",
    };
  }
}

/** @deprecated Use extractSupplierFromEmailThread */
export async function extractSupplierFromEmail(message: MailboxMessage) {
  const result = await extractSupplierFromEmailThread({
    messages: [message],
    focusMessageId: message.id,
  });

  if (!result.data) {
    return { data: null, raw: result.raw, error: result.error };
  }

  const recommended = result.data.candidates[result.data.recommendedIndex] ?? null;
  return {
    data: recommended
      ? {
          company: recommended.company,
          senderEmail: recommended.senderEmail,
          contactName: recommended.contactName,
          domain: recommended.domain,
        }
      : null,
    raw: result.raw,
    error: result.error,
  };
}
