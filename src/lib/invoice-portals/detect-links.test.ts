import { describe, expect, it } from "vitest";
import {
  detectXeroDownloadPdfLinks,
  detectXeroDownloadPdfUrl,
  emailHasProcessableInvoiceSource,
} from "./detect-links";

const downloadUrl =
  "https://in.xero.com/vy0upM544LajXwSrzkpgjunXmOLC2quo7tI0kGWi/Invoice/DownloadPdf/b8305230-22ae-45e7-8f24-9659f965bde0?utm_source=remindersEmailUrl";

describe("detectXeroDownloadPdfUrl", () => {
  it("finds a DownloadPdf link in HTML hrefs", () => {
    const bodyHtml = `<a href="${downloadUrl}">Download PDF</a>`;

    expect(detectXeroDownloadPdfUrl({ bodyHtml })).toMatchObject({
      provider: "xero",
      shareToken: "vy0upM544LajXwSrzkpgjunXmOLC2quo7tI0kGWi",
      invoiceId: "b8305230-22ae-45e7-8f24-9659f965bde0",
      url: "https://in.xero.com/vy0upM544LajXwSrzkpgjunXmOLC2quo7tI0kGWi/Invoice/DownloadPdf/b8305230-22ae-45e7-8f24-9659f965bde0",
    });
  });

  it("decodes HTML entities in href values", () => {
    const encoded = downloadUrl.replace(/&/g, "&amp;");
    const bodyHtml = `<a href="${encoded}">Download PDF</a>`;

    expect(detectXeroDownloadPdfUrl({ bodyHtml })?.url).toBe(
      "https://in.xero.com/vy0upM544LajXwSrzkpgjunXmOLC2quo7tI0kGWi/Invoice/DownloadPdf/b8305230-22ae-45e7-8f24-9659f965bde0",
    );
  });

  it("finds a DownloadPdf link in plain text", () => {
    expect(detectXeroDownloadPdfUrl({ bodyText: `Invoice: ${downloadUrl}` })?.invoiceId).toBe(
      "b8305230-22ae-45e7-8f24-9659f965bde0",
    );
  });

  it("ignores view-only Xero links", () => {
    const bodyHtml =
      '<a href="https://in.xero.com/vy0upM544LajXwSrzkpgjunXmOLC2quo7tI0kGWi?utm_source=overduePayNowButton#paynow">Pay now</a>';

    expect(detectXeroDownloadPdfUrl({ bodyHtml })).toBeNull();
  });

  it("deduplicates repeated links", () => {
    const bodyHtml = `<a href="${downloadUrl}">One</a><a href="${downloadUrl}">Two</a>`;

    expect(detectXeroDownloadPdfLinks({ bodyHtml })).toHaveLength(1);
  });
});

describe("emailHasProcessableInvoiceSource", () => {
  it("returns true when attachments exist", () => {
    expect(
      emailHasProcessableInvoiceSource({
        attachmentCount: 1,
        bodyHtml: null,
        bodyText: null,
      }),
    ).toBe(true);
  });

  it("returns true when a Xero DownloadPdf link is present", () => {
    expect(
      emailHasProcessableInvoiceSource({
        attachmentCount: 0,
        bodyHtml: `<a href="${downloadUrl}">Download PDF</a>`,
      }),
    ).toBe(true);
  });

  it("returns false when there is no attachment or portal link", () => {
    expect(
      emailHasProcessableInvoiceSource({
        attachmentCount: 0,
        bodyHtml: "<p>Please pay your invoice</p>",
      }),
    ).toBe(false);
  });
});
