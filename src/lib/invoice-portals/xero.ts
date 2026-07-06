const XERO_FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Resolve a Xero share link (in.xero.com/<token>) to its PDF download URL via
 * the same public getDocument API the online invoice viewer uses. The response
 * carries the document GUID needed to build the DownloadPdf URL.
 */
export async function resolveXeroShareLinkPdfUrl(shareToken: string): Promise<{
  downloadUrl: string | null;
  invoiceId: string | null;
  error?: string;
}> {
  try {
    const response = await fetch(`https://in.xero.com/api/${shareToken}/getDocument`, {
      method: "GET",
      headers: {
        "User-Agent": XERO_FETCH_USER_AGENT,
        Accept: "application/json",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        downloadUrl: null,
        invoiceId: null,
        error: `Xero share link lookup failed (HTTP ${response.status})`,
      };
    }

    const document = (await response.json()) as { id?: unknown };
    const invoiceId = typeof document.id === "string" ? document.id : null;

    if (!invoiceId) {
      return {
        downloadUrl: null,
        invoiceId: null,
        error: "Xero share link lookup did not return a document id",
      };
    }

    return {
      downloadUrl: `https://in.xero.com/${shareToken}/Invoice/DownloadPdf/${invoiceId}`,
      invoiceId,
    };
  } catch (error) {
    return {
      downloadUrl: null,
      invoiceId: null,
      error: error instanceof Error ? error.message : "Xero share link lookup failed",
    };
  }
}

export async function fetchXeroInvoicePdf(downloadUrl: string): Promise<{
  buffer: Buffer;
  error?: string;
}> {
  try {
    const response = await fetch(downloadUrl, {
      method: "GET",
      headers: {
        "User-Agent": XERO_FETCH_USER_AGENT,
        Accept: "application/pdf,*/*",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        buffer: Buffer.alloc(0),
        error: `Xero PDF download failed (HTTP ${response.status})`,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    const looksLikePdf =
      contentType.includes("pdf") || buffer.subarray(0, 4).toString("utf8") === "%PDF";

    if (!looksLikePdf || buffer.length === 0) {
      return {
        buffer,
        error: "Xero PDF download did not return a PDF",
      };
    }

    return { buffer };
  } catch (error) {
    return {
      buffer: Buffer.alloc(0),
      error: error instanceof Error ? error.message : "Xero PDF download failed",
    };
  }
}
