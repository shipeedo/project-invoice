import { callAiChatCompletion } from "@/lib/ai-chat";
import { htmlToPlainText } from "@/lib/email-body";
import { parseJsonContent } from "@/lib/extraction";

const MAX_CLASSIFICATION_BODY_CHARS = 6_000;

export const EMAIL_CLASSIFICATION_CATEGORIES = [
  "invoice",
  "credit_note",
  "statement",
  "receipt_or_remittance",
  "quote",
  "dispute_or_claim",
  "conversation",
  "marketing",
  "other",
] as const;

export type EmailClassificationCategory =
  (typeof EMAIL_CLASSIFICATION_CATEGORIES)[number];

export type EmailClassificationConfidence = "high" | "medium" | "low";

export type EmailInvoiceClassification = {
  category: EmailClassificationCategory;
  confidence: EmailClassificationConfidence;
  reason: string | null;
};

export const EMAIL_CLASSIFICATION_JSON_SCHEMA = `{
  "category": "invoice | credit_note | statement | receipt_or_remittance | quote | dispute_or_claim | conversation | marketing | other",
  "confidence": "high | medium | low — how certain you are of the category",
  "reason": "string — one short sentence explaining the classification"
}` as const;

export const EMAIL_CLASSIFICATION_SYSTEM_PROMPT = `You are the mailroom triage clerk for the accounts payable inbox of a transport and logistics company. For each inbound email you decide whether it DELIVERS a new supplier invoice that should be imported into the invoice system, or is something else.

## Categories
- "invoice": the email delivers a new supplier invoice / tax invoice — attached as a document, linked via an online invoice portal, or written out in the email body. Forwarded invoices (FW:) count.
- "credit_note": the email delivers an actual credit note / adjustment note document issued by the supplier. A message merely ANNOUNCING that a credit was approved or will be applied is NOT a credit_note — that is "dispute_or_claim".
- "statement": a statement of account / account statement listing previously issued invoices, balances, or ageing buckets.
- "receipt_or_remittance": payment receipts, remittance advice, or payment confirmations.
- "quote": quotes, estimates, or rate cards.
- "dispute_or_claim": correspondence about a claim, dispute, query, or credit request AT ANY STAGE — lodging it, chasing it, or its resolution ("dispute approved", "credit approved", "resolved with a credit", credit reference numbers) — even when it references invoice numbers, consignment numbers, or amounts, or has forms/paperwork attached.
- "conversation": an ongoing back-and-forth (RE: threads, questions, follow-ups, requests to sign or review documents) that does not deliver a new invoice.
- "marketing": newsletters, promotions, service announcements.
- "other": anything else (delivery notifications, purchase orders, reminders without an invoice, etc.).

## Critical distinctions
- An email ABOUT an invoice is not an invoice. Disputes, claims, queries, payment chasers, and requests to review or sign paperwork must NOT be classified "invoice", even when they quote invoice or tracking numbers or carry attachments such as claim forms or declarations.
- Beware structured-looking bodies. A dispute resolution or credit approval often lists "Invoice Number:", "Amount:", and "Credit Ref:" fields — those quote an EXISTING invoice being credited; they do not deliver a new one. Signals like "credit approved", "dispute approved/resolved", "this will be reflected in your billing period", or a credit reference number mean "dispute_or_claim" with high confidence.
- Having a PDF attached does not make an email an invoice — judge from the subject, the message text, and the attachment names what the attachment actually is.
- A genuine invoice delivery usually announces itself: "please find attached invoice", "your invoice is ready", an invoice number in the subject, an amount due, or an invoice portal link.
- The reverse also holds: when an attachment filename clearly names an invoice document (e.g. "Indeed_Invoice_SGI26-00070579.pdf", "Tax Invoice 51424.pdf"), the email delivers that invoice — classify "invoice" even if the covering message is conversational or administrative. Dropping a real invoice is worse than importing a borderline one.
- When the email is a reply within a thread (RE:), classify what THIS message delivers, not what the thread was originally about.

## Output format
- Respond with a single JSON object only — no markdown, no commentary outside JSON.
- If you genuinely cannot tell, pick the closest category and set confidence to "low".`;

export function buildEmailClassificationUserPrompt(params: {
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  bodyText?: string | null;
  attachmentNames?: string[];
}) {
  const attachmentLine =
    params.attachmentNames && params.attachmentNames.length > 0
      ? `\nAttachments: ${params.attachmentNames.join(", ")}`
      : "\nAttachments: (none)";

  const body = params.bodyText?.trim()
    ? params.bodyText.trim().slice(0, MAX_CLASSIFICATION_BODY_CHARS)
    : "(empty)";

  return `Classify this inbound email for the accounts payable inbox.

Return JSON matching this schema exactly:
${EMAIL_CLASSIFICATION_JSON_SCHEMA}

Subject: ${params.subject ?? "(none)"}
From: ${params.fromName ? `${params.fromName} <${params.fromEmail ?? "unknown"}>` : (params.fromEmail ?? "(unknown)")}${attachmentLine}

Email body:
"""
${body}
"""`;
}

export function normalizeEmailClassification(
  raw: unknown,
): EmailInvoiceClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const category =
    typeof record.category === "string"
      ? record.category.trim().toLowerCase().replace(/[\s-]+/g, "_")
      : "";
  if (
    !EMAIL_CLASSIFICATION_CATEGORIES.includes(
      category as EmailClassificationCategory,
    )
  ) {
    return null;
  }

  const confidenceRaw =
    typeof record.confidence === "string"
      ? record.confidence.trim().toLowerCase()
      : "";
  const confidence: EmailClassificationConfidence =
    confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
      ? confidenceRaw
      : "low";

  return {
    category: category as EmailClassificationCategory,
    confidence,
    reason: typeof record.reason === "string" ? record.reason.trim() || null : null,
  };
}

/**
 * Only a confident non-invoice classification blocks processing. Invoices and
 * credit notes always proceed, and anything the classifier is unsure about
 * falls through to extraction so a flaky model never drops a real invoice.
 */
export function classificationAllowsInvoiceProcessing(
  classification: EmailInvoiceClassification | null,
) {
  if (!classification) return true;
  if (classification.category === "invoice") return true;
  if (classification.category === "credit_note") return true;
  return classification.confidence === "low";
}

/**
 * Classifies an inbound email as an invoice delivery or something else using
 * the extraction AI. Returns null when the AI is unavailable or returns
 * garbage, so callers fail open and continue with extraction.
 */
export async function classifyInboundEmail(params: {
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  attachmentNames?: string[];
}): Promise<EmailInvoiceClassification | null> {
  const bodyText =
    params.bodyText?.trim() ||
    (params.bodyHtml ? htmlToPlainText(params.bodyHtml) : null);

  const userPrompt = buildEmailClassificationUserPrompt({
    subject: params.subject,
    fromEmail: params.fromEmail,
    fromName: params.fromName,
    bodyText,
    attachmentNames: params.attachmentNames,
  });

  try {
    const result = await callAiChatCompletion({
      systemPrompt: EMAIL_CLASSIFICATION_SYSTEM_PROMPT,
      userPrompt,
    });
    if ("error" in result) return null;

    return normalizeEmailClassification(
      JSON.parse(parseJsonContent(result.content)),
    );
  } catch {
    return null;
  }
}
