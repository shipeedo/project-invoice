import { describe, expect, it } from "vitest";
import { describeAuditEvent } from "@/lib/audit-log";

describe("describeAuditEvent", () => {
  it("names the line and decision for line decisions", () => {
    const result = describeAuditEvent(
      "invoice.line_decisions_updated",
      JSON.stringify({
        decisions: [
          { lineIndex: 1, lineNumber: 2, description: "Fuel surcharge", status: "REJECTED" },
        ],
        status: "APPROVED",
      }),
    );
    expect(result.label).toBe("Line items rejected");
    expect(result.description).toBe(
      "Rejected line 2 “Fuel surcharge” · Invoice status: Approved",
    );
  });

  it("splits mixed decisions into approved and rejected groups", () => {
    const result = describeAuditEvent(
      "invoice.line_decisions_updated",
      JSON.stringify({
        decisions: [
          { lineIndex: 0, description: "Freight", status: "APPROVED" },
          { lineIndex: 1, description: "Fuel surcharge", status: "REJECTED" },
        ],
      }),
    );
    expect(result.label).toBe("Line item decisions updated");
    expect(result.description).toContain("Approved line 1 “Freight”");
    expect(result.description).toContain("Rejected line 2 “Fuel surcharge”");
  });

  it("falls back to the line number for legacy events without descriptions", () => {
    const result = describeAuditEvent(
      "invoice.line_decisions_updated",
      JSON.stringify({ decisions: [{ lineIndex: 2, status: "APPROVED" }] }),
    );
    expect(result.description).toContain("Approved line 3");
  });

  it("describes a full invoice approval with note and line count", () => {
    const result = describeAuditEvent(
      "invoice.approved",
      JSON.stringify({ note: "Looks good", lineItemCount: 3 }),
    );
    expect(result.label).toBe("Invoice approved");
    expect(result.description).toBe(
      "All 3 line items marked approved · Note: Looks good",
    );
  });

  it("describes payments with amount, running total, and reference", () => {
    const result = describeAuditEvent(
      "invoice.payment_recorded",
      JSON.stringify({
        amount: 100,
        amountPaid: 100,
        transactionRef: "https://accounting.example/txn/1",
      }),
      "AUD",
    );
    expect(result.label).toBe("Payment recorded");
    expect(result.description).toBe(
      "$100.00 recorded · total paid $100.00 · ref https://accounting.example/txn/1",
    );
  });

  it("labels a settling payment as paid in full", () => {
    expect(describeAuditEvent("invoice.paid", JSON.stringify({ amount: 150 })).label).toBe(
      "Invoice paid in full",
    );
  });

  it("shows the hold reason and the restored status", () => {
    expect(
      describeAuditEvent("invoice.held", JSON.stringify({ reason: "Disputed charge" }))
        .description,
    ).toBe("Reason: Disputed charge");
    expect(
      describeAuditEvent(
        "invoice.hold_released",
        JSON.stringify({ restoredStatus: "PENDING_APPROVAL" }),
      ).description,
    ).toBe("Status restored to Pending Approval");
  });

  it("prettifies unknown actions and survives bad JSON", () => {
    expect(describeAuditEvent("invoice.some_new_thing", null).label).toBe("Some New Thing");
    expect(describeAuditEvent("invoice.approved", "not json").label).toBe("Invoice approved");
  });
});
