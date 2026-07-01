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
  "company": "string or null — the supplier/carrier company name",
  "senderEmail": "string or null — the email address used to send this email",
  "contactName": "string or null — specific person at the supplier who sent the email, if identifiable",
  "domain": "string or null — domain name used to send the email (e.g. acme.com)"
}` as const;

export const SUPPLIER_FROM_EMAIL_SYSTEM_PROMPT = `You are in accounts receivable and you need to set up a new supplier. This supplier has sent us an email and we need to know the following information:
* what is the company
* what email address was used to send this email
* is there a specific contact within the supplier that sent this email
* what is the domain name used to send the email

Read the email headers and body carefully. Prefer explicit header values (From, Reply-To, signature blocks) over guesses in the message body.

## Rules
- "company" is the supplier/carrier organisation, not our company or a customer we bill.
- "senderEmail" is the address the supplier used to send this message (usually From or Reply-To).
- "contactName" is a person's name when clearly identifiable; use null if only a generic mailbox is shown.
- "domain" is the part after @ in senderEmail, or the organisation's email domain if the sender uses a shared mailbox on that domain.
- If a field cannot be determined reliably, use null — do not invent values.

## Output format
- Respond with a single JSON object only — no markdown, no commentary outside JSON.`;

export function buildSupplierFromEmailUserPrompt(params: {
  fromName: string | null;
  fromEmail: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  receivedAt: string | null;
  body: string;
}) {
  const headerLines = [
    params.fromEmail
      ? `From: ${params.fromName ? `${params.fromName} <${params.fromEmail}>` : params.fromEmail}`
      : null,
    params.toEmails.length > 0 ? `To: ${params.toEmails.join(", ")}` : null,
    params.ccEmails.length > 0 ? `Cc: ${params.ccEmails.join(", ")}` : null,
    params.subject ? `Subject: ${params.subject}` : null,
    params.receivedAt ? `Date: ${params.receivedAt}` : null,
  ].filter(Boolean);

  return `Extract supplier setup details from this email.

Return JSON matching this schema exactly:
${SUPPLIER_FROM_EMAIL_JSON_SCHEMA}

Email headers:
${headerLines.join("\n")}

Email body:
"""
${params.body}
"""`;
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
