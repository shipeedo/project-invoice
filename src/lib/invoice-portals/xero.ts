const XERO_FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
