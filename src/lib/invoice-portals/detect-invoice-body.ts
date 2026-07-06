import { htmlToPlainText } from "@/lib/email-body";
import { emailLooksLikeAccountStatement } from "@/lib/invoice-portals/detect-account-statement";

const INVOICE_KEYWORD_PATTERN =
  /\b(tax invoice|invoice number|invoice no\.?|inv\.?\s*#|invoice #|amount due|total due|payment due|balance due|please find (?:attached )?invoice)\b/i;

const STRONG_INVOICE_SUBJECT_PATTERN =
  /\b(tax invoice|invoice no\.?|invoice number|invoice #|inv[-\s]?#?\d)/i;

const CURRENCY_AMOUNT_PATTERN = /\$\s?[\d,]+\.\d{2}/;

function resolvePlainBody(params: {
  bodyHtml?: string | null;
  bodyText?: string | null;
}) {
  if (params.bodyText?.trim()) return params.bodyText.trim();
  if (params.bodyHtml?.trim()) return htmlToPlainText(params.bodyHtml);
  return "";
}

export function emailBodyContainsInvoice(params: {
  subject?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  attachmentFileNames?: string[];
}) {
  if (
    emailLooksLikeAccountStatement({
      subject: params.subject,
      bodyHtml: params.bodyHtml,
      bodyText: params.bodyText,
      attachmentFileNames: params.attachmentFileNames,
    })
  ) {
    return false;
  }

  if (params.subject && STRONG_INVOICE_SUBJECT_PATTERN.test(params.subject)) {
    return true;
  }

  const body = resolvePlainBody(params);
  if (!body) return false;

  if (INVOICE_KEYWORD_PATTERN.test(body)) {
    return true;
  }

  if (
    CURRENCY_AMOUNT_PATTERN.test(body) &&
    /\b(invoice|amount|total|due|payable)\b/i.test(body) &&
    !/\bstatement\b/i.test(body)
  ) {
    return true;
  }

  return false;
}
