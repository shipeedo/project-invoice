import { describe, expect, it } from "vitest";
import {
  applyCreditOutcomeToLines,
  canRequestCreditForLine,
  computeFuelCreditAmount,
  computeGstCreditAmount,
  computeInvoiceFuelRate,
  isFuelLine,
  parseFuelRatePercent,
  markLinesCreditPending,
  parseCreateCreditLinesInput,
  parseCreditRequestLineItems,
  resolveDefaultApprovedAmount,
  sumRequestedAmounts,
} from "@/lib/credit-line-utils";
import type { ExtractedLineItem } from "@/lib/extraction";

describe("credit line helpers", () => {
  it("parses create-line input with reason", () => {
    expect(
      parseCreateCreditLinesInput([
        {
          lineIndex: 0,
          requestedAmount: 12.5,
          reason: "NOT_OUR_CONSIGNMENT",
        },
      ]),
    ).toEqual([
      {
        lineIndex: 0,
        requestedAmount: 12.5,
        reason: "NOT_OUR_CONSIGNMENT",
        reasonDetail: null,
      },
    ]);
    expect(parseCreateCreditLinesInput([])).toBeNull();
    expect(
      parseCreateCreditLinesInput([{ lineIndex: 0, reason: "OTHER" }]),
    ).toBeNull();
    expect(
      parseCreateCreditLinesInput([
        { lineIndex: 0, reason: "OTHER", reasonDetail: "Wrong lane" },
      ]),
    ).toEqual([
      {
        lineIndex: 0,
        requestedAmount: undefined,
        reason: "OTHER",
        reasonDetail: "Wrong lane",
      },
    ]);
  });

  it("blocks credit on pending or approved credit lines", () => {
    expect(canRequestCreditForLine("REJECTED")).toBe(true);
    expect(canRequestCreditForLine("CREDIT_PENDING")).toBe(false);
    expect(canRequestCreditForLine("CREDIT_APPROVED")).toBe(false);
  });

  it("marks selected lines as credit pending", () => {
    const lines: ExtractedLineItem[] = [
      { description: "Freight", amount: 100, status: "REJECTED" },
      { description: "Fuel", amount: 20 },
    ];

    const next = markLinesCreditPending(
      lines,
      [
        {
          lineIndex: 0,
          description: "Freight",
          requestedAmount: 100,
          reason: "NOT_OUR_CONSIGNMENT",
        },
      ],
      "cr_1",
    );

    expect(next[0].status).toBe("CREDIT_PENDING");
    expect(next[0].creditRequestId).toBe("cr_1");
    expect(next[1].status).toBeUndefined();
  });

  it("applies approved and denied outcomes to linked lines", () => {
    const lines: ExtractedLineItem[] = [
      { description: "Freight", status: "CREDIT_PENDING", creditRequestId: "cr_1" },
      { description: "Fuel", status: "APPROVED" },
    ];
    const creditLines = parseCreditRequestLineItems(
      JSON.stringify([
        {
          lineIndex: 0,
          description: "Freight",
          requestedAmount: 100,
          reason: "SERVICE_DOWNGRADE",
        },
      ]),
    );

    expect(
      applyCreditOutcomeToLines(lines, creditLines, "APPROVED")[0].status,
    ).toBe("CREDIT_APPROVED");
    expect(
      applyCreditOutcomeToLines(lines, creditLines, "DENIED")[0].status,
    ).toBe("CREDIT_DENIED");
  });

  it("sums requested amounts", () => {
    expect(
      sumRequestedAmounts(
        parseCreditRequestLineItems(
          JSON.stringify([
            { lineIndex: 0, description: "A", requestedAmount: 10 },
            { lineIndex: 1, description: "B", requestedAmount: 5 },
          ]),
        ),
      ),
    ).toBe(15);
  });

  it("detects fuel lines by service type or description", () => {
    expect(isFuelLine({ description: "Fuel levy", serviceType: undefined })).toBe(true);
    expect(isFuelLine({ description: "Cartage", serviceType: "Fuel Surcharge" })).toBe(true);
    expect(isFuelLine({ description: "Freight", serviceType: "Express" })).toBe(false);
  });

  it("derives the invoice fuel rate from fuel and non-fuel amounts", () => {
    const lines: ExtractedLineItem[] = [
      { description: "Freight", amount: 100 },
      { description: "Cartage", amount: 100 },
      { description: "Fuel levy", amount: 30 },
    ];

    expect(computeInvoiceFuelRate(lines)).toBeCloseTo(0.15);
    expect(computeInvoiceFuelRate([{ description: "Freight", amount: 100 }])).toBeNull();
    expect(computeInvoiceFuelRate([])).toBeNull();
  });

  it("computes the fuel credit from selected non-fuel lines only", () => {
    const lines: ExtractedLineItem[] = [
      { description: "Freight", amount: 100 },
      { description: "Cartage", amount: 100 },
      { description: "Fuel levy", amount: 30 },
    ];

    expect(
      computeFuelCreditAmount(lines, [
        { lineIndex: 0, requestedAmount: 80 },
        { lineIndex: 2, requestedAmount: 30 },
      ]),
    ).toBe(12);
    expect(
      computeFuelCreditAmount(lines, [{ lineIndex: 2, requestedAmount: 30 }]),
    ).toBeNull();
    expect(
      computeFuelCreditAmount(
        [{ description: "Freight", amount: 100 }],
        [{ lineIndex: 0, requestedAmount: 100 }],
      ),
    ).toBeNull();
  });

  it("parses fuel levy percentages into fractions", () => {
    expect(parseFuelRatePercent("10.39")).toBeCloseTo(0.1039);
    expect(parseFuelRatePercent("100")).toBe(1);
    expect(parseFuelRatePercent("0")).toBeNull();
    expect(parseFuelRatePercent("101")).toBeNull();
    expect(parseFuelRatePercent("abc")).toBeNull();
    expect(parseFuelRatePercent("")).toBeNull();
  });

  it("prefers a user-supplied fuel rate over the derived one", () => {
    const lines: ExtractedLineItem[] = [
      { description: "Freight", amount: 100 },
      { description: "Fuel levy", amount: 15 },
    ];

    // Derived rate would be 15%, override says 20%.
    expect(
      computeFuelCreditAmount(lines, [{ lineIndex: 0, requestedAmount: 100 }], 0.2),
    ).toBe(20);
    // Override also works when the invoice has no fuel lines to derive from.
    expect(
      computeFuelCreditAmount(
        [{ description: "Freight", amount: 100 }],
        [{ lineIndex: 0, requestedAmount: 50 }],
        0.1,
      ),
    ).toBe(5);
  });

  it("computes GST on the credited subtotal", () => {
    expect(computeGstCreditAmount(115)).toBe(11.5);
    expect(computeGstCreditAmount(0)).toBeNull();
    expect(computeGstCreditAmount(-5)).toBeNull();
  });

  it("resolves default approved amount from total or line sum", () => {
    const lineItems = JSON.stringify([
      { lineIndex: 0, description: "A", requestedAmount: 10 },
      { lineIndex: 1, description: "B", requestedAmount: 5 },
    ]);

    expect(resolveDefaultApprovedAmount(99, lineItems)).toBe(99);
    expect(resolveDefaultApprovedAmount(null, lineItems)).toBe(15);
    expect(resolveDefaultApprovedAmount(0, lineItems)).toBe(15);
    expect(resolveDefaultApprovedAmount(null, "[]")).toBeNull();
  });
});
