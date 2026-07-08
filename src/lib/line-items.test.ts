import { describe, expect, it } from "vitest";
import { parseLineItems, resolveLineItemStatus } from "@/lib/line-items";
import type { ExtractedLineItem } from "@/lib/extraction";

describe("parseLineItems", () => {
  it("returns empty array for null input", () => {
    expect(parseLineItems(null)).toEqual([]);
  });

  it("parses valid JSON", () => {
    const items: ExtractedLineItem[] = [{ description: "Freight", amount: 100 }];
    expect(parseLineItems(JSON.stringify(items))).toEqual(items);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseLineItems("{not json")).toEqual([]);
  });
});

describe("resolveLineItemStatus", () => {
  it("defaults to pending", () => {
    expect(resolveLineItemStatus({ description: "A" })).toBe("PENDING");
  });

  it("returns stored status", () => {
    expect(resolveLineItemStatus({ description: "A", status: "APPROVED" })).toBe(
      "APPROVED",
    );
  });
});
