import { describe, expect, it } from "vitest";
import {
  canCancelInvoice,
  isExtractionPending,
  isFullyPaid,
  outstandingAmount,
  resolvePaymentStatus,
} from "@/lib/invoice-status";

describe("outstandingAmount", () => {
  it("returns the remaining balance", () => {
    expect(outstandingAmount(100, 40)).toBe(60);
  });

  it("never goes below zero on overpayment", () => {
    expect(outstandingAmount(100, 120)).toBe(0);
  });

  it("returns null when the total is unknown", () => {
    expect(outstandingAmount(null, 40)).toBeNull();
  });
});

describe("isFullyPaid", () => {
  it("treats sub-cent float drift as fully paid", () => {
    expect(isFullyPaid(0.3, 0.1 + 0.2)).toBe(true);
    expect(isFullyPaid(100, 99.999)).toBe(true);
  });

  it("is false while a balance remains", () => {
    expect(isFullyPaid(100, 99.5)).toBe(false);
  });

  it("is false when the total is unknown", () => {
    expect(isFullyPaid(null, 500)).toBe(false);
  });
});

describe("resolvePaymentStatus", () => {
  it("returns part paid while a balance remains", () => {
    expect(resolvePaymentStatus({ totalAmount: 100, amountPaid: 40 })).toBe("PART_PAID");
  });

  it("returns paid once the total is covered", () => {
    expect(resolvePaymentStatus({ totalAmount: 100, amountPaid: 100 })).toBe("PAID");
  });

  it("honours an explicit mark-as-paid", () => {
    expect(
      resolvePaymentStatus({ totalAmount: null, amountPaid: 40, markAsPaid: true }),
    ).toBe("PAID");
  });
});

describe("canCancelInvoice", () => {
  it("allows cancelling open invoices", () => {
    expect(canCancelInvoice("DRAFT")).toBe(true);
    expect(canCancelInvoice("ON_HOLD")).toBe(true);
    expect(canCancelInvoice("PART_PAID")).toBe(true);
  });

  it("blocks cancelling closed invoices", () => {
    expect(canCancelInvoice("PAID")).toBe(false);
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
