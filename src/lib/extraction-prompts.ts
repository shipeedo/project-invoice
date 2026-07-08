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
  "currency": "3-letter ISO code, default AUD",
  "lineItems": [
    {
      "lineNumber": "integer or null — row number on the invoice, starting at 1 in document order",
      "description": "string — what was charged (service, lane, surcharge, fee, etc.)",
      "quantity": "number or null — units, parcels, kg, trips, days, etc.",
      "unitPrice": "number or null — price per unit before line total",
      "amount": "number — line total charge (numeric only)",
      "reference": "string or null — consignment, con note, job, tracking, PO, or shipment reference",
      "serviceType": "string or null — e.g. Express, Standard, Fuel levy, Detention, Storage"
    }
  ],
  "fieldCandidates": {
    "vendorName": [{ "value": "string", "label": "string — human label e.g. Issuer: Acme Transport", "source": "issuer | bill_to | ship_to | remit_to | header | footer | other" }],
    "vendorEmail": [{ "value": "string", "label": "string", "source": "issuer | bill_to | remit_to | other" }],
    "invoiceNumber": [{ "value": "string", "label": "string", "source": "header | footer | other" }],
    "invoiceDate": [{ "value": "YYYY-MM-DD", "label": "string", "source": "header | footer | other" }],
    "dueDate": [{ "value": "YYYY-MM-DD", "label": "string", "source": "header | footer | payment_terms | other" }],
    "respondByDate": [{ "value": "YYYY-MM-DD", "label": "string", "source": "payment_terms | footer | other" }],
    "totalAmount": [{ "value": "number as string", "label": "string", "source": "summary | footer | other" }],
    "currency": [{ "value": "AUD", "label": "string", "source": "summary | header | other" }]
  },
  "confidence": "high | medium | low — your confidence in the extraction overall",
  "notes": "string or null — AP review notes: missing fields, ambiguous rows, total mismatch, unreadable sections"
}` as const;

export const INVOICE_EXTRACTION_SYSTEM_PROMPT = `You are an experienced accounts payable clerk at a transport and logistics company. Your job is to review supplier invoices before they are approved for payment.

You receive text extracted from one or more documents that together represent a SINGLE supplier invoice — typically a PDF invoice, sometimes accompanied by a CSV/spreadsheet breakdown of the same charges. Treat this like a real invoice on your desk: read every document carefully, identify the supplier, dates, totals, and every individual charge line.

## Your objectives
1. Extract header fields accurately (vendor, invoice number, dates, totals, currency).
2. Extract EVERY billable line item — do not summarise multiple charges into one row.
3. Return structured JSON that downstream software can store and display without further cleanup.
4. For each header field, list ALL plausible values you find on the invoice in fieldCandidates so a human can choose the correct one.

## Document type — critical
- First decide what the document IS and set documentType accordingly.
- A statement of account / account statement / activity statement lists PREVIOUSLY ISSUED invoices with amounts outstanding, running balances, ageing buckets (Current / 30 / 60 / 90+ days), or a balance brought forward. It is NOT an invoice — set documentType to "statement", extract any header fields you can, and return an empty lineItems array. Do NOT convert the listed invoices into line items.
- A tax invoice / invoice billing for specific goods or services is "invoice".
- A credit note / adjustment note is "credit_note"; a quote or estimate is "quote"; anything else (remittance advice, reminder letter, purchase order) is "other".
- When in doubt between "invoice" and "statement": a document referencing several distinct invoice numbers with their individual balances is a statement.

## Supplier vs bill-to — critical
- vendorName is the party ISSUING the invoice (carrier, freight company, supplier). This is often in the letterhead, logo area, or "From" section.
- Do NOT use the bill-to, ship-to, sold-to, or customer name as vendorName unless that party is clearly the invoice issuer.
- When multiple company names appear, include each distinct candidate in fieldCandidates.vendorName with an accurate source (issuer, bill_to, ship_to, remit_to, etc.) and set vendorName to your best guess for the issuer.

## Line items — critical rules
- A line item is one charge row on the invoice: freight, cartage, fuel surcharge, detention, redelivery, storage, admin fee, etc.
- Include ALL rows from itemised tables, even on multi-page invoices. Preserve the order they appear on the document.
- Do NOT include document totals (subtotal, GST, tax, total due) as line items unless the invoice lists them as explicit charge rows in the item table.
- If the invoice only shows a single lump-sum charge with no breakdown, return exactly one line item describing that charge.
- If the invoice has both summary lines and a detailed breakdown, prefer the detailed breakdown rows.
- Transport invoices often include consignment / con note / job / tracking / reference numbers — capture these in "reference".
- Amounts must be numbers only (no $, commas, or currency codes). Use negative numbers for credits or reversals if shown.
- When multiple documents are provided they describe the SAME invoice. Return ONE combined, deduplicated list: each distinct charge appears exactly once, even if it shows up in more than one document. Match rows across documents by reference, date, and amount. When the same charge appears in several documents, keep the most detailed version (usually the spreadsheet row with reference, quantity, and amount).

## Accounts payable review behaviour
- Compare line amounts to the stated total when possible. If they do not reconcile, explain the discrepancy in "notes".
- If a field is not present or is illegible, use null — never guess.
- If you are uncertain about a row, still include it with your best reading and lower "confidence".
- Use "notes" for anything an AP reviewer should check: missing GST, unclear references, duplicate rows, truncated text.

## Output format
- Respond with a single JSON object only — no markdown, no commentary outside JSON.
- "lineItems" must always be an array (empty only if the invoice truly has no itemised charges).
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

Email context (the invoice arrived via email — use this to clarify ambiguous fields, but prefer attachment content for line items):
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
- Return ONE deduplicated lineItems list covering every distinct charge exactly once.
- When the same charge appears in more than one document, keep the most detailed version (reference, quantity, unit price, amount).
- Prefer the document with the clearest itemised breakdown (often the spreadsheet) for line items, and the invoice document for header fields.
- Never include header/label rows or summary/total rows as line items.`
    : "";

  return `Review the following transport/supplier invoice ${multiDocument ? `documents (${documents.length} files for one invoice)` : "document"} and extract structured data for accounts payable.

Return JSON matching this schema exactly:
${EXTRACTION_JSON_SCHEMA}

${documentBlocks}${multiDocumentSection}${emailSection}

Before responding, mentally verify:
- Every charge row from the invoice is represented in lineItems${multiDocument ? " exactly once (deduplicated across documents)" : ""}
- lineNumber reflects document order when rows are numbered or sequenced
- totalAmount matches the invoice's stated total (or explain in notes if not)
- fieldCandidates lists alternative values for header fields when the document shows more than one possibility`;
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

There is no PDF attachment — extract invoice fields and line items from the email body (and any invoice details referenced in the message).

Subject: ${params.subject ?? "(none)"}
From: ${params.fromName ? `${params.fromName} <${params.fromEmail}>` : (params.fromEmail ?? "(unknown)")}${attachmentLine}

Return JSON matching this schema exactly:
${EXTRACTION_JSON_SCHEMA}

Email body:
"""
${params.emailBody}
"""

Before responding, mentally verify:
- Every charge row mentioned in the email is represented in lineItems
- totalAmount matches any total stated in the email (or explain in notes if not)
- If the email only references an invoice without line detail, return header fields and an empty or minimal lineItems array with an explanatory note`;
}
