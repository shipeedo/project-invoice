export const EXTRACTION_JSON_SCHEMA = `{
  "documentType": "invoice | credit_note | statement | quote | other — what this document actually is. A statement of account (a list of previously issued invoices with balances owing, ageing buckets, or amounts brought forward) is 'statement', NOT 'invoice'",
  "vendorName": "string — supplier/carrier name (the party issuing the invoice, NOT bill-to or ship-to)",
  "vendorEmail": "string or null — supplier email if shown",
  "invoiceNumber": "string or null — invoice / tax invoice number",
  "invoiceDate": "ISO 8601 date string (YYYY-MM-DD) or null",
  "dueDate": "ISO 8601 date string (YYYY-MM-DD) or null",
  "respondByDate": "ISO 8601 date string (YYYY-MM-DD) or null — deadline to respond, dispute, or query the invoice if stated (e.g. 'disputes must be lodged by', 'respond by', 'query within X days')",
  "totalAmount": "number — invoice total / amount due (numeric only, no currency symbols)",
  "subtotal": "number or null — amount before tax if shown separately",
  "taxAmount": "number or null — GST/VAT/tax total if shown separately",
  "accountReference": "string or null — the buyer/customer account identifier the supplier printed on the invoice. Labels vary: Account, Account No, Customer Account, Cost Centre, Reference, Your Reference, Department. Return the value only (never the label); null when no such identifier appears",
  "currency": "3-letter ISO code, default AUD",
  "confidence": "high | medium | low — your confidence in the extraction overall",
  "notes": "string or null — AP review notes: missing fields, total discrepancies between documents, unreadable sections"
}` as const;

export const INVOICE_EXTRACTION_SYSTEM_PROMPT = `You are an experienced accounts payable clerk at a transport and logistics company. Your job is to review supplier invoices before they are approved for payment.

You receive text extracted from one or more documents that together represent a SINGLE supplier invoice — typically a PDF invoice, sometimes accompanied by a CSV/spreadsheet breakdown of the same charges. Treat this like a real invoice on your desk: read every document carefully and identify the supplier, dates, and totals. The documents themselves remain the source of truth — you only need the header fields, not the individual charge lines.

## Your objectives
1. Extract header fields accurately (vendor, invoice number, dates, totals, currency).
2. Totals are the product — verify totalAmount is the amount due on the invoice, and note any discrepancy between documents in "notes".
3. Return structured JSON that downstream software can store and display without further cleanup.

## Document type — critical
- First decide what the document IS and set documentType accordingly.
- A statement of account / account statement / activity statement lists PREVIOUSLY ISSUED invoices with amounts outstanding, running balances, ageing buckets (Current / 30 / 60 / 90+ days), or a balance brought forward. It is NOT an invoice — set documentType to "statement" and extract any header fields you can.
- A tax invoice / invoice billing for specific goods or services is "invoice".
- A credit note / adjustment note is "credit_note"; a quote or estimate is "quote"; anything else (remittance advice, reminder letter, purchase order) is "other".
- When in doubt between "invoice" and "statement": a document referencing several distinct invoice numbers with their individual balances is a statement.

## Supplier vs bill-to — critical
- vendorName is the party ISSUING the invoice (carrier, freight company, supplier). This is often in the letterhead, logo area, or "From" section.
- Do NOT use the bill-to, ship-to, sold-to, or customer name as vendorName unless that party is clearly the invoice issuer.
- When multiple company names appear, set vendorName to your best judgement of the issuer and mention the ambiguity in "notes".

## Account reference
- accountReference is the identifier the supplier uses for the CUSTOMER'S account on this invoice — the value printed next to labels like Account, Account No, Customer Account, Cost Centre, Reference, Your Reference, or Department.
- Different suppliers use different labels for the same thing; normalize whichever appears into this one field.
- Return the value only, never the label (e.g. "Chill Chair", not "Account: Chill Chair").
- Do not confuse it with the invoice number, a purchase order number, or the supplier's own ABN/registration numbers. Null when no customer account identifier appears.

## Accounts payable review behaviour
- Amounts must be numbers only (no $, commas, or currency codes).
- When multiple documents are provided they describe the SAME invoice — prefer the invoice document (usually the PDF) for header fields and use the spreadsheet to confirm totals.
- If a field is not present or is illegible, use null — never guess.
- Use "notes" for anything an AP reviewer should check: missing GST, total discrepancies between documents, truncated text.

## Output format
- Respond with a single JSON object only — no markdown, no commentary outside JSON.
- Dates must be ISO 8601 (YYYY-MM-DD).`;

export const SUPPLIER_FROM_EMAIL_JSON_SCHEMA = `{
  "candidates": [
    {
      "company": "string or null — the supplier/carrier company name",
      "senderEmail": "string or null — email address for this supplier (From, Reply-To, billing, or accounts)",
      "contactName": "string or null — specific person at this supplier, if identifiable",
      "domain": "string or null — email domain for this supplier (e.g. acme.com)",
      "label": "string — short UI label, e.g. Invoice issuer: CouriersPlease",
      "source": "invoice_issuer | email_sender | forwarder | signature | remit_to | other",
      "confidence": "high | medium | low",
      "reasoning": "string or null — one sentence explaining why this is a plausible supplier"
    }
  ],
  "recommendedIndex": "integer — 0-based index of the best supplier candidate for invoice processing"
}` as const;

export const SUPPLIER_FROM_EMAIL_SYSTEM_PROMPT = `You are in accounts payable setting up a new supplier from an email conversation thread.

Review the ENTIRE thread — all messages in chronological order — not just the latest message. Transport and logistics emails are often forwarded: the person who sent the email to us may be a broker or freight forwarder, while the actual invoice supplier is named in the forwarded content or attachment text.

## Your objectives
1. Identify every distinct organisation that could reasonably be set up as the supplier for invoices in this thread.
2. For each candidate, extract company name, contact email, contact person, and email domain.
3. Rank candidates and set recommendedIndex to the organisation most likely to be the invoice issuer (not our company, not the customer we bill, and usually not the forwarder unless they are clearly the billing party).

## Common patterns
- Forwarded invoice: include BOTH the forwarder (email sender) AND the invoice issuer (named in the forwarded body/PDF text) as separate candidates.
- Direct supplier email: usually one high-confidence candidate from the sender.
- Broker sending on behalf of carrier: include the carrier as invoice_issuer and the broker as forwarder.

## Field rules
- "company" is the supplier/carrier organisation — never our company or a customer we bill.
- "senderEmail" is the best email to associate with that supplier (billing@, accounts@, From, or Reply-To as appropriate).
- "contactName" is a person's name when clearly identifiable; null for generic mailboxes.
- "domain" is the part after @ in senderEmail, or the supplier's known email domain.
- Use null for fields that cannot be determined reliably — do not invent values.
- Return at least one candidate when any supplier can be inferred; return multiple when the thread is ambiguous.

## Output format
- Respond with a single JSON object only — no markdown, no commentary outside JSON.
- candidates must be ordered from most to least likely as the invoice supplier.
- recommendedIndex must point at your best pick for invoice processing.`;

export type SupplierFromEmailThreadMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromName: string | null;
  fromEmail: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  receivedAt: string | null;
  body: string;
};

export function buildSupplierFromEmailUserPrompt(params: {
  messages: SupplierFromEmailThreadMessage[];
  focusMessageId?: string;
}) {
  const threadBlocks = params.messages.map((message, index) => {
    const headerLines = [
      message.fromEmail
        ? `From: ${message.fromName ? `${message.fromName} <${message.fromEmail}>` : message.fromEmail}`
        : null,
      message.toEmails.length > 0 ? `To: ${message.toEmails.join(", ")}` : null,
      message.ccEmails.length > 0 ? `Cc: ${message.ccEmails.join(", ")}` : null,
      message.subject ? `Subject: ${message.subject}` : null,
      message.receivedAt ? `Date: ${message.receivedAt}` : null,
    ].filter(Boolean);

    const focusNote =
      params.focusMessageId === message.id
        ? "\n(This is the message the user selected when opening create supplier.)"
        : "";

    return `--- Message ${index + 1} (${message.direction})${focusNote} ---
${headerLines.join("\n")}

Body:
"""
${message.body}
"""`;
  });

  return `Extract supplier setup details from this email thread.

Return JSON matching this schema exactly:
${SUPPLIER_FROM_EMAIL_JSON_SCHEMA}

Email thread (${params.messages.length} message${params.messages.length === 1 ? "" : "s"}, oldest to newest):
${threadBlocks.join("\n\n")}`;
}

export type ExtractionPromptDocument = {
  fileName: string;
  text: string;
};

export function buildInvoiceExtractionUserPrompt(
  documents: ExtractionPromptDocument[],
  emailContext?: {
    subject?: string | null;
    fromEmail?: string | null;
    fromName?: string | null;
    bodyText?: string | null;
  },
) {
  const emailSection =
    emailContext?.bodyText?.trim()
      ? `

Email context (the invoice arrived via email — use this to clarify ambiguous fields, but prefer attachment content for invoice fields):
Subject: ${emailContext.subject ?? "(none)"}
From: ${emailContext.fromName ? `${emailContext.fromName} <${emailContext.fromEmail}>` : (emailContext.fromEmail ?? "(unknown)")}

Email body:
"""
${emailContext.bodyText.trim()}
"""`
      : "";

  const multiDocument = documents.length > 1;

  const documentBlocks = documents
    .map(
      (document, index) => `--- Document ${index + 1} of ${documents.length}: ${document.fileName} ---
"""
${document.text}
"""`,
    )
    .join("\n\n");

  const multiDocumentSection = multiDocument
    ? `

The documents above all belong to the SAME invoice (e.g. a PDF invoice plus a CSV/spreadsheet breakdown of its charges). Combine them into a single extraction:
- Prefer the invoice document (usually the PDF) for header fields.
- Use the spreadsheet to confirm totals; note any discrepancy between documents in "notes".`
    : "";

  return `Review the following transport/supplier invoice ${multiDocument ? `documents (${documents.length} files for one invoice)` : "document"} and extract structured data for accounts payable.

Return JSON matching this schema exactly:
${EXTRACTION_JSON_SCHEMA}

${documentBlocks}${multiDocumentSection}${emailSection}

Before responding, mentally verify:
- totalAmount is the invoice's stated amount due (or explain in notes if unclear)
- vendorName is the invoice ISSUER, not the bill-to party
- Dates are ISO 8601 (YYYY-MM-DD) or null`;
}

export function buildInvoiceExtractionFromEmailUserPrompt(params: {
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  emailBody: string;
  attachmentNames?: string[];
}) {
  const attachmentLine =
    params.attachmentNames && params.attachmentNames.length > 0
      ? `\nAttachments: ${params.attachmentNames.join(", ")}`
      : "";

  return `Review the following supplier invoice email and extract structured invoice data for accounts payable.

There is no PDF attachment — extract invoice fields from the email body (and any invoice details referenced in the message).

Subject: ${params.subject ?? "(none)"}
From: ${params.fromName ? `${params.fromName} <${params.fromEmail}>` : (params.fromEmail ?? "(unknown)")}${attachmentLine}

Return JSON matching this schema exactly:
${EXTRACTION_JSON_SCHEMA}

Email body:
"""
${params.emailBody}
"""

Before responding, mentally verify:
- totalAmount matches any total stated in the email (or explain in notes if not)
- vendorName is the invoice issuer, not our company
- Fields not stated in the email are null — never guessed`;
}
