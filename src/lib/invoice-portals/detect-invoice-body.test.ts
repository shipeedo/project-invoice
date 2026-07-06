import { describe, expect, it } from "vitest";
import { emailBodyContainsInvoice } from "./detect-invoice-body";

describe("emailBodyContainsInvoice", () => {
  it("detects invoice in subject", () => {
    expect(emailBodyContainsInvoice({ subject: "Tax Invoice #1234 from Carrier Co" })).toBe(true);
  });

  it("detects invoice keywords in body text", () => {
    expect(
      emailBodyContainsInvoice({
        bodyText: "Please find attached your tax invoice for March freight charges.",
      }),
    ).toBe(true);
  });

  it("detects amount due phrasing with currency", () => {
    expect(
      emailBodyContainsInvoice({
        bodyText: "Amount due: $1,234.56. Please pay by end of month.",
      }),
    ).toBe(true);
  });

  it("returns false for unrelated email content", () => {
    expect(
      emailBodyContainsInvoice({
        subject: "Meeting tomorrow",
        bodyText: "Can we reschedule our catch-up to Thursday afternoon?",
      }),
    ).toBe(false);
  });
});
