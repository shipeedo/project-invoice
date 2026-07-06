import { htmlToPlainText } from "@/lib/email-body";

const STRONG_INVOICE_PATTERN =
  /\b(tax invoice|invoice no\.?|invoice number|invoice #|inv[-\s]?#?\d|\binv-\d)/i;

const STATEMENT_TEXT_PATTERN =
  /\b(?:statement of account|account statement|customer statement|activity statement|monthly statement|weekly statement|statement period|statement date|your statement|outstanding (?:account )?balance|aged (?:trial )?balance|balance (?:summary|brought forward)|summary of (?:account|outstanding)|remittance summary)\b/i;

const STATEMENT_FILENAME_PATTERN =
  /\b(?:soa|statement|account[\s_-]?statement|stmt)\b/i;

function resolvePlainBody(params: {
  bodyHtml?: string | null;
  bodyText?: string | null;
}) {
  if (params.bodyText?.trim()) return params.bodyText.trim();
  if (params.bodyHtml?.trim()) return htmlToPlainText(params.bodyHtml);
  return "";
}

function collectSearchText(params: {
  subject?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  attachmentFileNames?: string[];
}) {
  const parts = [
    params.subject?.trim(),
    resolvePlainBody(params),
    params.attachmentFileNames?.join(" "),
  ].filter(Boolean);

  return parts.join("\n");
}

export function hasStrongInvoiceSignal(text: string) {
  return STRONG_INVOICE_PATTERN.test(text);
}

export function textLooksLikeAccountStatement(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;

  if (STATEMENT_TEXT_PATTERN.test(normalized)) {
    return !hasStrongInvoiceSignal(normalized);
  }

  return false;
}

export function attachmentNameLooksLikeAccountStatement(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  if (!STATEMENT_FILENAME_PATTERN.test(baseName)) {
    return false;
  }

  return !hasStrongInvoiceSignal(baseName);
}

export function emailLooksLikeAccountStatement(params: {
  subject?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  attachmentFileNames?: string[];
}) {
  const combined = collectSearchText(params);

  if (textLooksLikeAccountStatement(combined)) {
    return true;
  }

  if (
    params.attachmentFileNames?.some((fileName) =>
      attachmentNameLooksLikeAccountStatement(fileName),
    )
  ) {
    const withoutStrongInvoice =
      !hasStrongInvoiceSignal(params.subject ?? "") &&
      !hasStrongInvoiceSignal(resolvePlainBody(params));
    if (withoutStrongInvoice) {
      return true;
    }
  }

  return false;
}

const AGED_BALANCE_COLUMNS_PATTERN =
  /\b(?:current|not yet due)\b[\s\S]{0,80}?\b(?:30\s*\+?\s*days?|1\s*month)\b[\s\S]{0,80}?\b(?:60\s*\+?\s*days?|2\s*months?)\b/i;

export function documentLooksLikeAccountStatement(text: string) {
  const header = text.trim().slice(0, 6_000);
  if (!header) return false;

  const statementWording = STATEMENT_TEXT_PATTERN.test(header);
  const titledAsTaxInvoice = /\btax invoice\b/i.test(header.slice(0, 300));

  // Ageing buckets (Current / 30 / 60 / 90+ days) only appear on statements,
  // so they win even when the document is full of invoice references.
  if (
    AGED_BALANCE_COLUMNS_PATTERN.test(header) &&
    (statementWording || /\b(?:balance|amount due|total due|outstanding)\b/i.test(header))
  ) {
    return true;
  }

  // A table of several invoice references alongside outstanding-balance wording
  // is a statement, unless the document opens as a tax invoice.
  const invoiceRowMatches = header.match(/\binvoice\s*(?:no\.?|number|#)\s*[:#]?\s*\S+/gi) ?? [];
  if (
    invoiceRowMatches.length >= 3 &&
    /\b(statement|outstanding|balance|amount due)\b/i.test(header) &&
    !titledAsTaxInvoice
  ) {
    return true;
  }

  // Statement wording anywhere in the opening pages. Unlike email subjects and
  // bodies, a statement document legitimately mentions invoice numbers (it lists
  // them), so invoice signals only veto when they appear in the title area.
  if (statementWording && !hasStrongInvoiceSignal(header.slice(0, 300))) {
    return true;
  }

  return false;
}
