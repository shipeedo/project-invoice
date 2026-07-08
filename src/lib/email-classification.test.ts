import { describe, expect, it } from "vitest";
import {
  buildEmailClassificationUserPrompt,
  classificationAllowsInvoiceProcessing,
  normalizeEmailClassification,
} from "@/lib/email-classification";

describe("buildEmailClassificationUserPrompt", () => {
  it("includes subject, sender, attachments, and body", () => {
    const prompt = buildEmailClassificationUserPrompt({
      subject: "Tax Invoice INV-123",
      fromEmail: "accounts@carrier.com",
      fromName: "Carrier Accounts",
      bodyText: "Please find attached your invoice.",
      attachmentNames: ["INV-123.pdf"],
    });

    expect(prompt).toContain("Subject: Tax Invoice INV-123");
    expect(prompt).toContain("Carrier Accounts <accounts@carrier.com>");
    expect(prompt).toContain("Attachments: INV-123.pdf");
    expect(prompt).toContain("Please find attached your invoice.");
  });

  it("marks missing attachments and empty bodies explicitly", () => {
    const prompt = buildEmailClassificationUserPrompt({
      subject: null,
      fromEmail: null,
    });

    expect(prompt).toContain("Subject: (none)");
    expect(prompt).toContain("From: (unknown)");
    expect(prompt).toContain("Attachments: (none)");
    expect(prompt).toContain("(empty)");
  });

  it("truncates very long bodies", () => {
    const prompt = buildEmailClassificationUserPrompt({
      bodyText: "x".repeat(20_000),
    });

    expect(prompt.length).toBeLessThan(10_000);
  });
});

describe("normalizeEmailClassification", () => {
  it("accepts a valid classification", () => {
    expect(
      normalizeEmailClassification({
        category: "dispute_or_claim",
        confidence: "high",
        reason: "Claim paperwork thread",
      }),
    ).toEqual({
      category: "dispute_or_claim",
      confidence: "high",
      reason: "Claim paperwork thread",
    });
  });

  it("normalizes category casing and separators", () => {
    expect(
      normalizeEmailClassification({
        category: "Dispute or Claim",
        confidence: "HIGH",
      }),
    ).toEqual({
      category: "dispute_or_claim",
      confidence: "high",
      reason: null,
    });
  });

  it("returns null for unknown categories", () => {
    expect(
      normalizeEmailClassification({ category: "spam", confidence: "high" }),
    ).toBeNull();
    expect(normalizeEmailClassification(null)).toBeNull();
    expect(normalizeEmailClassification("invoice")).toBeNull();
  });

  it("defaults invalid confidence to low", () => {
    expect(
      normalizeEmailClassification({ category: "invoice", confidence: "sure" }),
    ).toEqual({ category: "invoice", confidence: "low", reason: null });
  });
});

describe("classificationAllowsInvoiceProcessing", () => {
  it("allows invoices and credit notes at any confidence", () => {
    expect(
      classificationAllowsInvoiceProcessing({
        category: "invoice",
        confidence: "low",
        reason: null,
      }),
    ).toBe(true);
    expect(
      classificationAllowsInvoiceProcessing({
        category: "credit_note",
        confidence: "high",
        reason: null,
      }),
    ).toBe(true);
  });

  it("blocks confident non-invoice classifications", () => {
    for (const confidence of ["high", "medium"] as const) {
      expect(
        classificationAllowsInvoiceProcessing({
          category: "dispute_or_claim",
          confidence,
          reason: null,
        }),
      ).toBe(false);
    }
  });

  it("fails open on low confidence or missing classification", () => {
    expect(
      classificationAllowsInvoiceProcessing({
        category: "conversation",
        confidence: "low",
        reason: null,
      }),
    ).toBe(true);
    expect(classificationAllowsInvoiceProcessing(null)).toBe(true);
  });
});
