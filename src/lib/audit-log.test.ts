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

  it("notes deselected lines on validation", () => {
    const result = describeAuditEvent(
      "invoice.validated",
      JSON.stringify({ rejectedLineIndexes: [1, 3], rejectedLineCount: 2 }),
    );
    expect(result.label).toBe("Invoice validated");
    expect(result.description).toBe("2 line items deselected and marked rejected");
  });

  it("has no description for a validation without deselected lines", () => {
    expect(describeAuditEvent("invoice.validated", JSON.stringify({})).description).toBeNull();
    expect(
      describeAuditEvent("invoice.validated", JSON.stringify({ totalsSource: "DOCUMENT" }))
        .description,
    ).toBeNull();
  });

  it("combines deselected lines and totals source on validation", () => {
    const result = describeAuditEvent(
      "invoice.validated",
      JSON.stringify({ rejectedLineCount: 1, totalsSource: "LINE_ITEMS" }),
    );
    expect(result.description).toBe(
      "1 line item deselected and marked rejected · Totals calculated from the selected line items",
    );
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

  it("describes created email invoices", () => {
    const result = describeAuditEvent(
      "email.invoice_created",
      JSON.stringify({ subject: "Invoice #1234" }),
    );
    expect(result.label).toBe("Invoice created from email");
    expect(result.description).toBe("Subject: Invoice #1234");
  });

  it("describes ignored emails with reason", () => {
    const result = describeAuditEvent(
      "email.ignored",
      JSON.stringify({ ignoreReason: "duplicate_invoice", subject: "Invoice #1234" }),
    );
    expect(result.label).toBe("Email ignored");
    expect(result.description).toContain("duplicate invoice");
    expect(result.description).toContain("Subject: Invoice #1234");
  });

  it("describes trash actions", () => {
    expect(describeAuditEvent("invoice.deleted", JSON.stringify({ reason: "Wrong supplier" })).label).toBe(
      "Moved to trash",
    );
    expect(
      describeAuditEvent("invoice.deleted", JSON.stringify({ reason: "Wrong supplier" }))
        .description,
    ).toBe("Reason: Wrong supplier");
    expect(describeAuditEvent("invoice.restored", null).label).toBe("Restored from trash");
  });
});
