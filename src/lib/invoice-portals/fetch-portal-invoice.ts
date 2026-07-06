import {
  detectXeroDownloadPdfUrl,
  detectXeroShareLink,
} from "@/lib/invoice-portals/detect-links";
import { fetchXeroInvoicePdf, resolveXeroShareLinkPdfUrl } from "@/lib/invoice-portals/xero";
import { saveBufferToUploads } from "@/lib/uploads";

export type PortalSavedAttachment = {
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
  isPrimary: boolean;
  sourceUrl: string;
  provider: "xero";
};

async function resolvePortalPdfLink(params: {
  bodyHtml?: string | null;
  bodyText?: string | null;
}): Promise<
  | { downloadUrl: string; sourceUrl: string; invoiceId: string }
  | { error: string; sourceUrl: string }
  | null
> {
  const directLink = detectXeroDownloadPdfUrl(params);
  if (directLink) {
    return {
      downloadUrl: directLink.url,
      sourceUrl: directLink.url,
      invoiceId: directLink.invoiceId,
    };
  }

  const shareLink = detectXeroShareLink(params);
  if (!shareLink) return null;

  const resolved = await resolveXeroShareLinkPdfUrl(shareLink.shareToken);
  if (!resolved.downloadUrl || !resolved.invoiceId) {
    return {
      error: resolved.error ?? "Xero share link could not be resolved to a PDF",
      sourceUrl: shareLink.url,
    };
  }

  return {
    downloadUrl: resolved.downloadUrl,
    sourceUrl: shareLink.url,
    invoiceId: resolved.invoiceId,
  };
}

export async function fetchPortalInvoicePdfAttachment(params: {
  bodyHtml?: string | null;
  bodyText?: string | null;
}): Promise<
  | { attachment: PortalSavedAttachment }
  | { error: string; sourceUrl: string; provider: "xero" }
  | null
> {
  const link = await resolvePortalPdfLink(params);
  if (!link) return null;

  if ("error" in link) {
    return { error: link.error, sourceUrl: link.sourceUrl, provider: "xero" };
  }

  const fetched = await fetchXeroInvoicePdf(link.downloadUrl);
  if (fetched.error) {
    return { error: fetched.error, sourceUrl: link.sourceUrl, provider: "xero" };
  }

  const fileName = `xero-${link.invoiceId}.pdf`;
  const saved = await saveBufferToUploads({
    buffer: fetched.buffer,
    fileName,
    mimeType: "application/pdf",
    subdir: "email",
  });

  return {
    attachment: {
      fileName,
      filePath: saved.storedPath,
      mimeType: saved.mimeType,
      size: saved.size,
      isPrimary: true,
      sourceUrl: link.sourceUrl,
      provider: "xero",
    },
  };
}
