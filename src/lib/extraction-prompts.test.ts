import { describe, expect, it } from "vitest";
import { buildInvoiceExtractionUserPrompt } from "@/lib/extraction-prompts";

describe("buildInvoiceExtractionUserPrompt", () => {
  it("renders a single document without multi-document instructions", () => {
    const prompt = buildInvoiceExtractionUserPrompt([
      { fileName: "invoice.pdf", text: "TAX INVOICE INV-1 Total $10.00" },
    ]);

    expect(prompt).toContain("Document 1 of 1: invoice.pdf");
    expect(prompt).toContain("TAX INVOICE INV-1 Total $10.00");
    expect(prompt).not.toContain("SAME invoice");
  });

  it("includes every document and dedupe instructions for multiple files", () => {
    const prompt = buildInvoiceExtractionUserPrompt([
      { fileName: "Invoice_INV369316.pdf", text: "PDF text here" },
      { fileName: "Invoice_INV369316.csv", text: "Date,Reference,Charge" },
    ]);

    expect(prompt).toContain("Document 1 of 2: Invoice_INV369316.pdf");
    expect(prompt).toContain("Document 2 of 2: Invoice_INV369316.csv");
    expect(prompt).toContain("PDF text here");
    expect(prompt).toContain("Date,Reference,Charge");
    expect(prompt).toContain("SAME invoice");
    expect(prompt).toContain("deduplicated lineItems list");
  });

  it("appends email context when a body is provided", () => {
    const prompt = buildInvoiceExtractionUserPrompt(
      [{ fileName: "invoice.pdf", text: "invoice text" }],
      {
        subject: "Invoice # INV369316.",
        fromEmail: "accounts@cochranes.com.au",
        fromName: "Cochranes Accounts",
        bodyText: "Please find your invoice attached.",
      },
    );

    expect(prompt).toContain("Subject: Invoice # INV369316.");
    expect(prompt).toContain("Cochranes Accounts <accounts@cochranes.com.au>");
    expect(prompt).toContain("Please find your invoice attached.");
  });
});
