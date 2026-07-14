import { describe, expect, it, vi } from "vitest";
import { callAiChatCompletion } from "@/lib/ai-chat";
import {
  extractInvoiceFromEmailBody,
  normalizeExtractedInvoice,
  type ExtractedInvoice,
} from "@/lib/extraction";

vi.mock("@/lib/ai-chat", () => ({
  callAiChatCompletion: vi.fn(),
}));

const aiMock = vi.mocked(callAiChatCompletion);

describe("extraction rate-limit flag", () => {
  it("marks the result rateLimited on a provider 429", async () => {
    aiMock.mockResolvedValueOnce({
      error: "AI Gateway error (429)",
      raw: null,
      status: 429,
    });
    const result = await extractInvoiceFromEmailBody("org-1", {
      bodyText: "Invoice attached",
    });
    expect(result.rateLimited).toBe(true);
    expect(result.data).toBeNull();
    expect(result.error).toContain("429");
  });

  it("leaves ordinary provider errors non-retryable", async () => {
    aiMock.mockResolvedValueOnce({
      error: "AI Gateway error (500)",
      raw: null,
      status: 500,
    });
    const result = await extractInvoiceFromEmailBody("org-1", {
      bodyText: "Invoice attached",
    });
    expect(result.rateLimited).toBe(false);
    expect(result.error).toContain("500");
  });
});

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
