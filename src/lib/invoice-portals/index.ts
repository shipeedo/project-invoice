export {
  detectXeroDownloadPdfLinks,
  detectXeroDownloadPdfUrl,
  detectXeroShareLink,
  detectXeroShareLinks,
  emailHasProcessableInvoiceSource,
  XERO_DOWNLOAD_PDF_URL_PATTERN,
  XERO_SHARE_URL_PATTERN,
  type XeroDownloadPdfLink,
  type XeroShareLink,
} from "@/lib/invoice-portals/detect-links";
export { fetchPortalInvoicePdfAttachment, type PortalSavedAttachment } from "@/lib/invoice-portals/fetch-portal-invoice";
export { fetchXeroInvoicePdf, resolveXeroShareLinkPdfUrl } from "@/lib/invoice-portals/xero";
