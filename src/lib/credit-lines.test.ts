import { describe, expect, it } from "vitest";
import {
  buildCreditRequestLineItems,
  computeGstCreditAmount,
  creditLineDescription,
  creditShortfall,
  parseCreateCreditLinesInput,
  parseCreditRequestLineItems,
  resolveApprovalStatus,
  resolveRequestedTotal,
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

  it("accepts lines with no description, which describe themselves by reason", () => {
    expect(
      parseCreateCreditLinesInput([
        { requestedAmount: 10, reason: "SERVICE_DOWNGRADE" },
      ]),
    ).toEqual([
      {
        description: null,
        requestedAmount: 10,
        quantity: null,
        reference: null,
        reason: "SERVICE_DOWNGRADE",
        reasonDetail: null,
      },
    ]);
  });

  it("rejects lines without an amount or a valid reason", () => {
    expect(parseCreateCreditLinesInput([])).toBeNull();
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

  it("describes a line by its reason when it has no description", () => {
    expect(creditLineDescription({ reason: "NOT_OUR_CONSIGNMENT" })).toBe(
      "Not our consignment",
    );
    expect(
      creditLineDescription({ reason: "OTHER", reasonDetail: "Wrong lane" }),
    ).toBe("Wrong lane");
    // Legacy rows keep their own text.
    expect(
      creditLineDescription({ description: "Freight", reason: "OTHER" }),
    ).toBe("Freight");
  });

  it("rejects OTHER without a custom detail, which would export as a bare 'Other'", () => {
    expect(
      parseCreateCreditLinesInput([{ requestedAmount: 10, reason: "OTHER" }]),
    ).toBeNull();
    expect(
      parseCreateCreditLinesInput([
        { requestedAmount: 10, reason: "OTHER", reasonDetail: "   " },
      ]),
    ).toBeNull();
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

  it("resolves the requested total from the stored total or the line sum", () => {
    const lineItems = JSON.stringify([
      { description: "A", requestedAmount: 10 },
      { description: "B", requestedAmount: 5 },
    ]);

    expect(resolveRequestedTotal(99, lineItems)).toBe(99);
    expect(resolveRequestedTotal(null, lineItems)).toBe(15);
    // A stored zero is no total at all — falling through to the lines here is
    // what keeps the saved status matching the dialog's preview.
    expect(resolveRequestedTotal(0, lineItems)).toBe(15);
    expect(resolveRequestedTotal(null, "[]")).toBeNull();
  });
});

describe("resolveApprovalStatus", () => {
  it("is a full approval when the carrier grants the requested total", () => {
    expect(resolveApprovalStatus(120, 120)).toBe("APPROVED");
  });

  it("is partial when the carrier grants less than requested", () => {
    expect(resolveApprovalStatus(80, 120)).toBe("PARTIALLY_APPROVED");
  });

  it("treats an over-approval as a full approval", () => {
    expect(resolveApprovalStatus(150, 120)).toBe("APPROVED");
  });

  it("does not let float noise turn an exact match into a partial", () => {
    expect(resolveApprovalStatus(0.1 + 0.2, 0.3)).toBe("APPROVED");
  });

  it("is a full approval when there is no requested total to fall short of", () => {
    expect(resolveApprovalStatus(50, null)).toBe("APPROVED");
    expect(resolveApprovalStatus(50, 0)).toBe("APPROVED");
  });
});

describe("creditShortfall", () => {
  const lineItems = JSON.stringify([{ requestedAmount: 120 }]);

  it("reports what the carrier withheld on a partial approval", () => {
    expect(
      creditShortfall({
        status: "PARTIALLY_APPROVED",
        requestedTotal: 120,
        approvedAmount: 80.5,
        lineItems,
      }),
    ).toBe(39.5);
  });

  it("falls back to the line sum, so a partial always shows its shortfall", () => {
    expect(
      creditShortfall({
        status: "PARTIALLY_APPROVED",
        requestedTotal: null,
        approvedAmount: 80.5,
        lineItems,
      }),
    ).toBe(39.5);
  });

  it("is silent for any other status", () => {
    expect(
      creditShortfall({
        status: "APPROVED",
        requestedTotal: 120,
        approvedAmount: 120,
        lineItems,
      }),
    ).toBeNull();
    expect(
      creditShortfall({
        status: "REJECTED",
        requestedTotal: 120,
        approvedAmount: null,
        lineItems,
      }),
    ).toBeNull();
  });
});
