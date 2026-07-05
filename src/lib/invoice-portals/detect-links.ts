/** Xero online invoice PDF download link from supplier emails. */
export const XERO_DOWNLOAD_PDF_URL_PATTERN =
  /https?:\/\/in\.xero\.com\/([A-Za-z0-9]+)\/Invoice\/DownloadPdf\/([0-9a-f-]{36})/gi;

export type XeroDownloadPdfLink = {
  provider: "xero";
  url: string;
  shareToken: string;
  invoiceId: string;
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

export function emailHasProcessableInvoiceSource(params: {
  attachmentCount: number;
  bodyHtml?: string | null;
  bodyText?: string | null;
}) {
  if (params.attachmentCount > 0) return true;
  return detectXeroDownloadPdfUrl(params) !== null;
}
