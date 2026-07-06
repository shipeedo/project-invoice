import { describe, expect, it } from "vitest";
import {
  addDays,
  normalizeTradingTermDays,
  resolveDueDate,
} from "@/lib/trading-terms";

const invoiceDate = new Date("2026-01-01T00:00:00.000Z");

describe("normalizeTradingTermDays", () => {
  it("keeps positive whole numbers", () => {
    expect(normalizeTradingTermDays(7)).toBe(7);
    expect(normalizeTradingTermDays(30.9)).toBe(30);
  });

  it("rejects zero, negatives, and non-numbers", () => {
    expect(normalizeTradingTermDays(0)).toBeNull();
    expect(normalizeTradingTermDays(-5)).toBeNull();
    expect(normalizeTradingTermDays("7")).toBeNull();
    expect(normalizeTradingTermDays(null)).toBeNull();
    expect(normalizeTradingTermDays(undefined)).toBeNull();
  });
});

describe("resolveDueDate", () => {
  it("overrides a differing stated due date with invoice date + terms", () => {
    const result = resolveDueDate({
      invoiceDate,
      extractedDueDate: new Date("2026-02-15T00:00:00.000Z"),
      tradingTermDays: 7,
    });
    expect(result.dueDate).toEqual(addDays(invoiceDate, 7));
    expect(result.originalDueDate).toEqual(new Date("2026-02-15T00:00:00.000Z"));
    expect(result.overridden).toBe(true);
    expect(result.tradingTermDays).toBe(7);
  });

  it("does not flag an override when the stated due date already matches", () => {
    const result = resolveDueDate({
      invoiceDate,
      extractedDueDate: addDays(invoiceDate, 7),
      tradingTermDays: 7,
    });
    expect(result.dueDate).toEqual(addDays(invoiceDate, 7));
    expect(result.originalDueDate).toBeNull();
    expect(result.overridden).toBe(false);
  });

  it("fills a due date from terms when none was stated, without flagging an override", () => {
    const result = resolveDueDate({
      invoiceDate,
      extractedDueDate: null,
      tradingTermDays: 14,
    });
    expect(result.dueDate).toEqual(addDays(invoiceDate, 14));
    expect(result.originalDueDate).toBeNull();
    expect(result.overridden).toBe(false);
  });

  it("keeps the stated due date when the supplier has no terms", () => {
    const stated = new Date("2026-02-15T00:00:00.000Z");
    const result = resolveDueDate({
      invoiceDate,
      extractedDueDate: stated,
      tradingTermDays: null,
    });
    expect(result.dueDate).toEqual(stated);
    expect(result.originalDueDate).toBeNull();
    expect(result.overridden).toBe(false);
  });

  it("keeps the stated due date when there is no invoice date to anchor terms", () => {
    const stated = new Date("2026-02-15T00:00:00.000Z");
    const result = resolveDueDate({
      invoiceDate: null,
      extractedDueDate: stated,
      tradingTermDays: 7,
    });
    expect(result.dueDate).toEqual(stated);
    expect(result.overridden).toBe(false);
  });
});
