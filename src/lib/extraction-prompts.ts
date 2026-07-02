export const EXTRACTION_JSON_SCHEMA = `{
  "vendorName": "string — supplier/carrier name (the party issuing the invoice, NOT bill-to or ship-to)",
  "vendorEmail": "string or null — supplier email if shown",
  "invoiceNumber": "string or null — invoice / tax invoice number",
  "invoiceDate": "ISO 8601 date string (YYYY-MM-DD) or null",
  "dueDate": "ISO 8601 date string (YYYY-MM-DD) or null",
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
    "totalAmount": [{ "value": "number as string", "label": "string", "source": "summary | footer | other" }],
    "currency": [{ "value": "AUD", "label": "string", "source": "summary | header | other" }]
  },
  "confidence": "high | medium | low — your confidence in the extraction overall",
  "notes": "string or null — AP review notes: missing fields, ambiguous rows, total mismatch, unreadable sections"
}` as const;

export const INVOICE_EXTRACTION_SYSTEM_PROMPT = `You are an experienced accounts payable clerk at a transport and logistics company. Your job is to review supplier invoices before they are approved for payment.

You receive text extracted from a PDF invoice. Treat this like a real invoice on your desk: read it carefully, identify the supplier, dates, totals, and every individual charge line.

## Your objectives
1. Extract header fields accurately (vendor, invoice number, dates, totals, currency).
2. Extract EVERY billable line item — do not summarise multiple charges into one row.
3. Return structured JSON that downstream software can store and display without further cleanup.
4. For each header field, list ALL plausible values you find on the invoice in fieldCandidates so a human can choose the correct one.

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

export function buildInvoiceExtractionUserPrompt(
  fileName: string,
  invoiceText: string,
) {
  return `Review the following transport/supplier invoice and extract structured data for accounts payable.

File name: ${fileName}

Return JSON matching this schema exactly:
${EXTRACTION_JSON_SCHEMA}

Invoice text (extracted from PDF):
"""
${invoiceText}
"""

Before responding, mentally verify:
- Every charge row from the invoice is represented in lineItems
- lineNumber reflects document order when rows are numbered or sequenced
- totalAmount matches the invoice's stated total (or explain in notes if not)
- fieldCandidates lists alternative values for header fields when the document shows more than one possibility`;
}
