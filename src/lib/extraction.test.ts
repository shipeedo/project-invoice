import { describe, expect, it } from "vitest";
import { normalizeExtractedInvoice, type ExtractedInvoice } from "@/lib/extraction";

describe("normalizeExtractedInvoice accountReference", () => {
  it("trims the extracted account reference", () => {
    const normalized = normalizeExtractedInvoice({
      accountReference: "  Chill Chair  ",
    } as ExtractedInvoice);
    expect(normalized.accountReference).toBe("Chill Chair");
  });

  it("caps overly long values", () => {
    const normalized = normalizeExtractedInvoice({
      accountReference: "x".repeat(500),
    } as ExtractedInvoice);
    expect(normalized.accountReference).toHaveLength(200);
  });

  it("drops empty or missing values", () => {
    expect(
      normalizeExtractedInvoice({ accountReference: "   " } as ExtractedInvoice)
        .accountReference,
    ).toBeUndefined();
    expect(normalizeExtractedInvoice({} as ExtractedInvoice).accountReference).toBeUndefined();
  });

  it("stringifies numeric account identifiers from the model", () => {
    const normalized = normalizeExtractedInvoice({
      accountReference: 400123 as unknown as string,
    } as ExtractedInvoice);
    expect(normalized.accountReference).toBe("400123");
  });
});
