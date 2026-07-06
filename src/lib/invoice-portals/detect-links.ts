import { emailBodyContainsInvoice } from "@/lib/invoice-portals/detect-invoice-body";
import { emailLooksLikeAccountStatement } from "@/lib/invoice-portals/detect-account-statement";

/** Xero online invoice PDF download link from supplier emails. */
export const XERO_DOWNLOAD_PDF_URL_PATTERN =
  /https?:\/\/in\.xero\.com\/([A-Za-z0-9]+)\/Invoice\/DownloadPdf\/([0-9a-f-]{36})/gi;

/**
 * Xero online invoice share link (newer email templates only link the viewer
 * page, e.g. https://in.xero.com/aBE3ZD7FRhAfVvFjwsU1o1PMLuzdezHDY73sZSgv).
 * The 25+ length floor and trailing lookahead keep this from matching other
 * in.xero.com paths (assets, logo, api) or DownloadPdf URLs.
 */
export const XERO_SHARE_URL_PATTERN =
  /https?:\/\/in\.xero\.com\/(?:m\/)?([A-Za-z0-9]{25,})(?![A-Za-z0-9/])/gi;

export type XeroDownloadPdfLink = {
  provider: "xero";
  url: string;
  shareToken: string;
  invoiceId: string;
};

export type XeroShareLink = {
  provider: "xero";
  url: string;
  shareToken: string;
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeDetectedUrl(raw: string) {
  return decodeHtmlEntities(raw.trim()).replace(/#.*$/, "");
}

function parseXeroDownloadPdfMatch(match: RegExpExecArray): XeroDownloadPdfLink {
  return {
    provider: "xero",
    url: normalizeDetectedUrl(match[0]),
    shareToken: match[1],
    invoiceId: match[2],
  };
}

function collectXeroDownloadPdfLinks(content: string) {
  const links: XeroDownloadPdfLink[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(XERO_DOWNLOAD_PDF_URL_PATTERN)) {
    const link = parseXeroDownloadPdfMatch(match);
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    links.push(link);
  }

  return links;
}

export function detectXeroDownloadPdfLinks(params: {
  bodyHtml?: string | null;
  bodyText?: string | null;
}): XeroDownloadPdfLink[] {
  const sources = [params.bodyHtml, params.bodyText].filter(
    (value): value is string => Boolean(value?.trim()),
  );

  const links: XeroDownloadPdfLink[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    for (const link of collectXeroDownloadPdfLinks(source)) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      links.push(link);
    }
  }

  return links;
}

export function detectXeroDownloadPdfUrl(params: {
  bodyHtml?: string | null;
  bodyText?: string | null;
}): XeroDownloadPdfLink | null {
  return detectXeroDownloadPdfLinks(params)[0] ?? null;
}

function collectXeroShareLinks(content: string) {
  const links: XeroShareLink[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(XERO_SHARE_URL_PATTERN)) {
    const shareToken = match[1];
    if (seen.has(shareToken)) continue;
    seen.add(shareToken);
    links.push({
      provider: "xero",
      url: `https://in.xero.com/${shareToken}`,
      shareToken,
    });
  }

  return links;
}

export function detectXeroShareLinks(params: {
  bodyHtml?: string | null;
  bodyText?: string | null;
}): XeroShareLink[] {
  const sources = [params.bodyHtml, params.bodyText].filter(
    (value): value is string => Boolean(value?.trim()),
  );

  const links: XeroShareLink[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    for (const link of collectXeroShareLinks(source)) {
      if (seen.has(link.shareToken)) continue;
      seen.add(link.shareToken);
      links.push(link);
    }
  }

  return links;
}

export function detectXeroShareLink(params: {
  bodyHtml?: string | null;
  bodyText?: string | null;
}): XeroShareLink | null {
  return detectXeroShareLinks(params)[0] ?? null;
}

export function emailHasProcessableInvoiceSource(params: {
  attachmentCount: number;
  attachmentFileNames?: string[];
  subject?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
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

  if (params.attachmentCount > 0) return true;
  if (detectXeroDownloadPdfUrl(params) !== null) return true;
  if (detectXeroShareLink(params) !== null) return true;
  return emailBodyContainsInvoice(params);
}
