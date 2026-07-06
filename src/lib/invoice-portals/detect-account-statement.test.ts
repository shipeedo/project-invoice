import { describe, expect, it } from "vitest";
import {
  attachmentNameLooksLikeAccountStatement,
  documentLooksLikeAccountStatement,
  emailLooksLikeAccountStatement,
  hasStrongInvoiceSignal,
  textLooksLikeAccountStatement,
} from "./detect-account-statement";

describe("emailLooksLikeAccountStatement", () => {
  it("detects statement of account in subject", () => {
    expect(
      emailLooksLikeAccountStatement({
        subject: "Statement of Account - March 2026",
      }),
    ).toBe(true);
  });

  it("detects statement attachment filenames", () => {
    expect(
      emailLooksLikeAccountStatement({
        subject: "Your monthly summary",
        attachmentFileNames: ["ABC-Statement-Mar-2026.pdf"],
      }),
    ).toBe(true);
  });

  it("does not treat tax invoices as statements", () => {
    expect(
      emailLooksLikeAccountStatement({
        subject: "Tax Invoice #12345",
        bodyText: "Please find attached your tax invoice.",
      }),
    ).toBe(false);
  });

  it("does not treat outstanding invoice lists in invoice emails as statements", () => {
    expect(hasStrongInvoiceSignal("Tax Invoice INV-7781")).toBe(true);
    expect(
      emailLooksLikeAccountStatement({
        subject: "Tax Invoice INV-7781",
        attachmentFileNames: ["INV-7781.pdf"],
      }),
    ).toBe(false);
  });
});

describe("documentLooksLikeAccountStatement", () => {
  it("detects statement headers in document text", () => {
    expect(
      documentLooksLikeAccountStatement(
        "STATEMENT OF ACCOUNT\nCustomer: Acme Logistics\nStatement Date: 2026-03-31\n",
      ),
    ).toBe(true);
  });

  it("detects multi-invoice statement tables", () => {
    const text = `Customer Statement
Invoice No: 1001  Amount Due: $100
Invoice No: 1002  Amount Due: $200
Invoice No: 1003  Amount Due: $300
Outstanding balance: $600`;

    expect(documentLooksLikeAccountStatement(text)).toBe(true);
  });

  it("does not flag a single tax invoice document", () => {
    expect(
      documentLooksLikeAccountStatement(
        "TAX INVOICE\nInvoice Number: INV-12345\nAmount Due: $500.00\n",
      ),
    ).toBe(false);
  });

  it("detects statements with ageing buckets even when invoice numbers appear early", () => {
    const text = `ACME TRANSPORT PTY LTD
Invoice Number  Date        Amount
INV-1001        01/03/2026  $120.00
INV-1002        08/03/2026  $340.00
Current      30 Days      60 Days      90+ Days
$120.00      $340.00      $0.00        $0.00
Total amount due: $460.00`;

    expect(documentLooksLikeAccountStatement(text)).toBe(true);
  });

  it("detects statement wording appearing beyond the first 500 characters", () => {
    const filler = "Customer service notes and remittance instructions. ".repeat(15);
    const text = `ACME TRANSPORT PTY LTD\n${filler}\nStatement of Account for March 2026\nOutstanding balance: $2,410.00`;

    expect(text.indexOf("Statement of Account")).toBeGreaterThan(500);
    expect(documentLooksLikeAccountStatement(text)).toBe(true);
  });

  it("does not flag an invoice that mentions an outstanding balance in the footer", () => {
    const text = `TAX INVOICE
Invoice Number: INV-88991
Freight charges: $500.00
GST: $50.00
Total: $550.00
Your outstanding account balance is $1,200.00`;

    expect(documentLooksLikeAccountStatement(text)).toBe(false);
  });
});

describe("attachmentNameLooksLikeAccountStatement", () => {
  it("matches common statement filenames", () => {
    expect(attachmentNameLooksLikeAccountStatement("statement-march.pdf")).toBe(true);
    expect(attachmentNameLooksLikeAccountStatement("SOA-2026-03.xlsx")).toBe(true);
  });

  it("does not match invoice filenames", () => {
    expect(attachmentNameLooksLikeAccountStatement("tax-invoice-123.pdf")).toBe(false);
  });
});

describe("textLooksLikeAccountStatement", () => {
  it("detects account statement phrasing in body text", () => {
    expect(
      textLooksLikeAccountStatement(
        "Please find attached your account statement for March. Outstanding balance: $1,234.56",
      ),
    ).toBe(true);
  });
});
