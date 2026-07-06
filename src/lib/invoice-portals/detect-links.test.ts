import { describe, expect, it } from "vitest";
import {
  detectXeroDownloadPdfLinks,
  detectXeroDownloadPdfUrl,
  detectXeroShareLink,
  detectXeroShareLinks,
  emailHasProcessableInvoiceSource,
} from "./detect-links";

const downloadUrl =
  "https://in.xero.com/vy0upM544LajXwSrzkpgjunXmOLC2quo7tI0kGWi/Invoice/DownloadPdf/b8305230-22ae-45e7-8f24-9659f965bde0?utm_source=remindersEmailUrl";

const shareUrl = "https://in.xero.com/aBE3ZD7FRhAfVvFjwsU1o1PMLuzdezHDY73sZSgv";

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

describe("detectXeroShareLink", () => {
  it("finds a share link in HTML hrefs", () => {
    const bodyHtml = `<a href="${shareUrl}?utm_source=invoiceEmailViewInvoiceButton&amp;utm_campaign=classicInvoicesEmailV2Standard">View invoice</a>`;

    expect(detectXeroShareLink({ bodyHtml })).toEqual({
      provider: "xero",
      url: shareUrl,
      shareToken: "aBE3ZD7FRhAfVvFjwsU1o1PMLuzdezHDY73sZSgv",
    });
  });

  it("finds a mobile-view share link", () => {
    expect(
      detectXeroShareLink({
        bodyText: "https://in.xero.com/m/aBE3ZD7FRhAfVvFjwsU1o1PMLuzdezHDY73sZSgv",
      })?.shareToken,
    ).toBe("aBE3ZD7FRhAfVvFjwsU1o1PMLuzdezHDY73sZSgv");
  });

  it("deduplicates repeated share links with different query params", () => {
    const bodyHtml = `<a href="${shareUrl}?utm_source=a">One</a><a href="${shareUrl}?utm_source=b">Two</a>`;

    expect(detectXeroShareLinks({ bodyHtml })).toHaveLength(1);
  });

  it("ignores DownloadPdf links and other in.xero.com paths", () => {
    const bodyHtml = [
      `<a href="${downloadUrl}">Download PDF</a>`,
      '<img src="https://in.xero.com/logo?id=ZXlKdklqb2lZelJoTkRZM04yTXRNRFZpWWkw">',
      '<script src="https://in.xero.com/assets/7d72eaf21406518274a681408fa90edcd6f60bad025"></script>',
    ].join("");

    expect(detectXeroShareLink({ bodyHtml })).toBeNull();
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

  it("returns true when only a Xero share link is present", () => {
    expect(
      emailHasProcessableInvoiceSource({
        attachmentCount: 0,
        bodyHtml: `<a href="${shareUrl}?utm_source=invoiceEmailViewInvoiceButton">View invoice</a>`,
      }),
    ).toBe(true);
  });

  it("returns true when the email body contains invoice indicators", () => {
    expect(
      emailHasProcessableInvoiceSource({
        attachmentCount: 0,
        bodyHtml: "<p>Please pay your tax invoice — amount due $500.00</p>",
      }),
    ).toBe(true);
  });

  it("returns false when there is no attachment, portal link, or invoice body", () => {
    expect(
      emailHasProcessableInvoiceSource({
        attachmentCount: 0,
        bodyHtml: "<p>Can we reschedule our meeting?</p>",
      }),
    ).toBe(false);
  });

  it("returns false for account statement emails", () => {
    expect(
      emailHasProcessableInvoiceSource({
        attachmentCount: 1,
        attachmentFileNames: ["statement-march-2026.pdf"],
        subject: "Statement of Account",
      }),
    ).toBe(false);
  });
});
