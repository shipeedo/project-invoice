import { describe, expect, it } from "vitest";
import {
  buildCreditRequestLineItems,
  computeGstCreditAmount,
  parseCreateCreditLinesInput,
  parseCreditRequestLineItems,
  resolveDefaultApprovedAmount,
  sumRequestedAmounts,
} from "@/lib/credit-line-utils";

describe("credit line helpers", () => {
  it("parses manual create-line input", () => {
    expect(
      parseCreateCreditLinesInput([
        {
          description: "Freight overcharge",
          requestedAmount: 12.5,
          reason: "NOT_OUR_CONSIGNMENT",
        },
      ]),
    ).toEqual([
      {
        description: "Freight overcharge",
        requestedAmount: 12.5,
        quantity: null,
        reference: null,
        reason: "NOT_OUR_CONSIGNMENT",
        reasonDetail: null,
      },
    ]);
  });

  it("rejects lines without a description, amount, or valid reason", () => {
    expect(parseCreateCreditLinesInput([])).toBeNull();
    expect(
      parseCreateCreditLinesInput([
        { description: "", requestedAmount: 10, reason: "OTHER" },
      ]),
    ).toBeNull();
    expect(
      parseCreateCreditLinesInput([
        { description: "Freight", requestedAmount: 0, reason: "SERVICE_DOWNGRADE" },
      ]),
    ).toBeNull();
    expect(
      parseCreateCreditLinesInput([
        { description: "Freight", requestedAmount: 10, reason: "NOT_A_REASON" },
      ]),
    ).toBeNull();
    // OTHER requires a custom detail.
    expect(
      parseCreateCreditLinesInput([
        { description: "Freight", requestedAmount: 10, reason: "OTHER" },
      ]),
    ).toBeNull();
    expect(
      parseCreateCreditLinesInput([
        {
          description: "Freight",
          requestedAmount: 10,
          reason: "OTHER",
          reasonDetail: "Wrong lane",
        },
      ]),
    ).toEqual([
      {
        description: "Freight",
        requestedAmount: 10,
        quantity: null,
        reference: null,
        reason: "OTHER",
        reasonDetail: "Wrong lane",
      },
    ]);
  });

  it("keeps optional quantity and reference when provided", () => {
    expect(
      parseCreateCreditLinesInput([
        {
          description: "Detention",
          requestedAmount: 45,
          quantity: 3,
          reference: "CON-123",
          reason: "SERVICE_DOWNGRADE",
        },
      ]),
    ).toEqual([
      {
        description: "Detention",
        requestedAmount: 45,
        quantity: 3,
        reference: "CON-123",
        reason: "SERVICE_DOWNGRADE",
        reasonDetail: null,
      },
    ]);
  });

  it("builds stored line items from validated input", () => {
    expect(
      buildCreditRequestLineItems([
        {
          description: "Freight",
          requestedAmount: 100,
          reason: "NOT_OUR_CONSIGNMENT",
        },
      ]),
    ).toEqual([
      {
        description: "Freight",
        requestedAmount: 100,
        quantity: null,
        reference: null,
        reason: "NOT_OUR_CONSIGNMENT",
        reasonDetail: null,
      },
    ]);
  });

  it("still parses legacy stored lines built from invoice lines", () => {
    const legacy = JSON.stringify([
      {
        lineIndex: 0,
        lineNumber: 1,
        description: "Freight",
        invoiceAmount: 100,
        requestedAmount: 80,
        reason: "SERVICE_DOWNGRADE",
      },
    ]);

    const parsed = parseCreditRequestLineItems(legacy);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].description).toBe("Freight");
    expect(parsed[0].invoiceAmount).toBe(100);
    expect(sumRequestedAmounts(parsed)).toBe(80);
  });

  it("sums requested amounts", () => {
    expect(
      sumRequestedAmounts(
        parseCreditRequestLineItems(
          JSON.stringify([
            { description: "A", requestedAmount: 10 },
            { description: "B", requestedAmount: 5 },
          ]),
        ),
      ),
    ).toBe(15);
  });

  it("computes GST on the credited subtotal", () => {
    expect(computeGstCreditAmount(115)).toBe(11.5);
    expect(computeGstCreditAmount(0)).toBeNull();
    expect(computeGstCreditAmount(-5)).toBeNull();
  });

  it("resolves default approved amount from total or line sum", () => {
    const lineItems = JSON.stringify([
      { description: "A", requestedAmount: 10 },
      { description: "B", requestedAmount: 5 },
    ]);

    expect(resolveDefaultApprovedAmount(99, lineItems)).toBe(99);
    expect(resolveDefaultApprovedAmount(null, lineItems)).toBe(15);
    expect(resolveDefaultApprovedAmount(0, lineItems)).toBe(15);
    expect(resolveDefaultApprovedAmount(null, "[]")).toBeNull();
  });
});
