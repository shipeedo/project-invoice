import { describe, expect, it } from "vitest";
import { canCancelInvoice, isExtractionPending } from "@/lib/invoice-status";

describe("canCancelInvoice", () => {
  it("allows cancelling open invoices", () => {
    expect(canCancelInvoice("DRAFT")).toBe(true);
    expect(canCancelInvoice("ON_HOLD")).toBe(true);
    expect(canCancelInvoice("APPROVED")).toBe(true);
  });

  it("blocks cancelling closed invoices", () => {
    expect(canCancelInvoice("CANCELLED")).toBe(false);
  });
});

describe("isExtractionPending", () => {
  it("is pending for a fresh draft with no extraction output", () => {
    expect(isExtractionPending({ status: "DRAFT" })).toBe(true);
  });

  it("resolves once extraction produced output or an error", () => {
    expect(isExtractionPending({ status: "DRAFT", extractionRaw: "{}" })).toBe(false);
    expect(isExtractionPending({ status: "DRAFT", parseError: "boom" })).toBe(false);
  });

  it("is never pending after validation or outside draft", () => {
    expect(isExtractionPending({ status: "DRAFT", validatedAt: new Date() })).toBe(false);
    expect(isExtractionPending({ status: "PENDING_APPROVAL" })).toBe(false);
  });
});
