import { detectXeroDownloadPdfUrl } from "@/lib/invoice-portals/detect-links";
import { fetchXeroInvoicePdf } from "@/lib/invoice-portals/xero";
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

export async function fetchPortalInvoicePdfAttachment(params: {
  bodyHtml?: string | null;
  bodyText?: string | null;
}): Promise<
  | { attachment: PortalSavedAttachment }
  | { error: string; sourceUrl: string; provider: "xero" }
  | null
> {
  const link = detectXeroDownloadPdfUrl(params);
  if (!link) return null;

  const fetched = await fetchXeroInvoicePdf(link.url);
  if (fetched.error) {
    return { error: fetched.error, sourceUrl: link.url, provider: "xero" };
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
      sourceUrl: link.url,
      provider: "xero",
    },
  };
}
