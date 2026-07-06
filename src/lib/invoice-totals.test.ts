import { describe, expect, it } from "vitest";
import {
  computeLineItemTotals,
  parseInvoiceTotalsSource,
} from "@/lib/invoice-totals";
import type { ExtractedLineItem } from "@/lib/extraction";

describe("parseInvoiceTotalsSource", () => {
  it("defaults a missing payload to the document totals", () => {
    expect(parseInvoiceTotalsSource(undefined)).toBe("DOCUMENT");
  });

  it("accepts the known sources", () => {
    expect(parseInvoiceTotalsSource("DOCUMENT")).toBe("DOCUMENT");
    expect(parseInvoiceTotalsSource("LINE_ITEMS")).toBe("LINE_ITEMS");
  });

  it("rejects unknown values", () => {
    expect(parseInvoiceTotalsSource(null)).toBeNull();
    expect(parseInvoiceTotalsSource("EXTRACTED")).toBeNull();
    expect(parseInvoiceTotalsSource(1)).toBeNull();
  });
});

describe("computeLineItemTotals", () => {
  it("sums line amounts and adds 10% GST", () => {
    const items: ExtractedLineItem[] = [
      { description: "Freight", amount: 100 },
      { description: "Fuel surcharge", amount: 10.5 },
    ];

    expect(computeLineItemTotals(items)).toEqual({
      subtotal: 110.5,
      taxAmount: 11.05,
      total: 121.55,
    });
  });

  it("rounds to two decimals", () => {
    const items: ExtractedLineItem[] = [
      { description: "A", amount: 10.333 },
      { description: "B", amount: 10.333 },
    ];

    const totals = computeLineItemTotals(items);
    expect(totals.subtotal).toBe(20.67);
    expect(totals.taxAmount).toBe(2.07);
    expect(totals.total).toBe(22.74);
  });

  it("skips lines without a usable amount", () => {
    const items: ExtractedLineItem[] = [
      { description: "Priced", amount: 50 },
      { description: "Unpriced" },
      { description: "Broken", amount: Number.NaN },
    ];

    expect(computeLineItemTotals(items)).toEqual({
      subtotal: 50,
      taxAmount: 5,
      total: 55,
    });
  });

  it("returns nulls when no line has an amount", () => {
    expect(computeLineItemTotals([])).toEqual({
      subtotal: null,
      taxAmount: null,
      total: null,
    });
    expect(computeLineItemTotals([{ description: "Unpriced" }])).toEqual({
      subtotal: null,
      taxAmount: null,
      total: null,
    });
  });
});
