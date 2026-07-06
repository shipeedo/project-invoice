import { describe, expect, it } from "vitest";
import {
  applyLineAssignmentUpdates,
  applyLineDecisionUpdates,
  applyLineEditUpdates,
  applyRejectedLineIndexes,
  deriveInvoiceStatusFromLineItems,
  mergeLineItemAssignments,
  parseLineItemEditUpdates,
  parseLineItems,
  parseRejectedLineIndexes,
  resolveLineAssigneeId,
  resolveLineItemStatus,
  setAllLineItemStatuses,
} from "@/lib/line-items";
import type { ExtractedLineItem } from "@/lib/extraction";

describe("parseLineItems", () => {
  it("returns empty array for null input", () => {
    expect(parseLineItems(null)).toEqual([]);
  });

  it("parses valid JSON", () => {
    const items: ExtractedLineItem[] = [{ description: "Freight", amount: 100 }];
    expect(parseLineItems(JSON.stringify(items))).toEqual(items);
  });
});

describe("resolveLineAssigneeId", () => {
  it("uses line override when set", () => {
    expect(
      resolveLineAssigneeId({ description: "A", assignedToId: "user-b" }, "user-a"),
    ).toBe("user-b");
  });

  it("falls back to invoice assignee", () => {
    expect(resolveLineAssigneeId({ description: "A" }, "user-a")).toBe("user-a");
  });
});

describe("mergeLineItemAssignments", () => {
  it("preserves assignments and status by index", () => {
    const existing: ExtractedLineItem[] = [
      { description: "A", assignedToId: "user-b", status: "APPROVED" },
      { description: "B", status: "REJECTED" },
    ];
    const incoming: ExtractedLineItem[] = [
      { description: "A updated", amount: 10 },
      { description: "B updated", amount: 20 },
    ];

    expect(mergeLineItemAssignments(existing, incoming)).toEqual([
      { description: "A updated", amount: 10, assignedToId: "user-b", status: "APPROVED" },
      { description: "B updated", amount: 20, status: "REJECTED" },
    ]);
  });
});

describe("applyLineAssignmentUpdates", () => {
  it("sets and clears line assignees", () => {
    const items: ExtractedLineItem[] = [
      { description: "A", assignedToId: "user-a" },
      { description: "B" },
    ];

    const updated = applyLineAssignmentUpdates(items, [
      { lineIndex: 0, assignedToId: "user-b" },
      { lineIndex: 1, assignedToId: "user-c" },
    ]);

    expect(updated[0].assignedToId).toBe("user-b");
    expect(updated[1].assignedToId).toBe("user-c");

    const cleared = applyLineAssignmentUpdates(updated, [
      { lineIndex: 0, assignedToId: null },
    ]);

    expect(cleared[0].assignedToId).toBeUndefined();
  });
});

describe("resolveLineItemStatus", () => {
  it("defaults to pending", () => {
    expect(resolveLineItemStatus({ description: "A" })).toBe("PENDING");
  });
});

describe("deriveInvoiceStatusFromLineItems", () => {
  const items = (statuses: Array<ExtractedLineItem["status"]>) =>
    statuses.map((status, index) => ({ description: `Line ${index + 1}`, status }));

  it("keeps the current status while all lines are pending", () => {
    expect(
      deriveInvoiceStatusFromLineItems(items([undefined, undefined]), "PENDING_APPROVAL"),
    ).toBe("PENDING_APPROVAL");
  });

  it("keeps the current status while some lines are still pending", () => {
    expect(
      deriveInvoiceStatusFromLineItems(items(["APPROVED", undefined]), "PENDING_APPROVAL"),
    ).toBe("PENDING_APPROVAL");
    expect(
      deriveInvoiceStatusFromLineItems(items(["REJECTED", undefined]), "DRAFT"),
    ).toBe("DRAFT");
  });

  it("returns approved when all lines are approved", () => {
    expect(
      deriveInvoiceStatusFromLineItems(items(["APPROVED", "APPROVED"]), "PENDING_APPROVAL"),
    ).toBe("APPROVED");
  });

  it("returns approved when decisions are mixed but none pending", () => {
    expect(
      deriveInvoiceStatusFromLineItems(items(["APPROVED", "REJECTED"]), "PENDING_APPROVAL"),
    ).toBe("APPROVED");
  });

  it("returns rejected when all lines are rejected", () => {
    expect(
      deriveInvoiceStatusFromLineItems(items(["REJECTED", "REJECTED"]), "PENDING_APPROVAL"),
    ).toBe("REJECTED");
  });

  it("keeps an approved invoice approved when a single line is rejected afterwards", () => {
    expect(
      deriveInvoiceStatusFromLineItems(items(["APPROVED", "REJECTED"]), "APPROVED"),
    ).toBe("APPROVED");
  });

  it("moves an approved invoice to rejected when every line is rejected afterwards", () => {
    expect(
      deriveInvoiceStatusFromLineItems(items(["REJECTED", "REJECTED"]), "APPROVED"),
    ).toBe("REJECTED");
  });
});

describe("applyLineDecisionUpdates", () => {
  it("updates selected line statuses", () => {
    const items: ExtractedLineItem[] = [{ description: "A" }, { description: "B" }];

    expect(
      applyLineDecisionUpdates(items, [{ lineIndex: 0, status: "APPROVED" }])[0].status,
    ).toBe("APPROVED");
  });
});

describe("parseLineItemEditUpdates", () => {
  it("accepts valid edits and trims strings", () => {
    expect(
      parseLineItemEditUpdates([
        { lineIndex: 0, fields: { description: " Freight ", amount: 12.5 } },
      ]),
    ).toEqual([{ lineIndex: 0, fields: { description: "Freight", amount: 12.5 } }]);
  });

  it("treats empty optional strings as clears", () => {
    expect(
      parseLineItemEditUpdates([{ lineIndex: 1, fields: { reference: "  " } }]),
    ).toEqual([{ lineIndex: 1, fields: { reference: null } }]);
  });

  it("rejects empty payloads, empty descriptions, and bad numbers", () => {
    expect(parseLineItemEditUpdates([])).toBeNull();
    expect(parseLineItemEditUpdates([{ lineIndex: 0, fields: {} }])).toBeNull();
    expect(
      parseLineItemEditUpdates([{ lineIndex: 0, fields: { description: " " } }]),
    ).toBeNull();
    expect(
      parseLineItemEditUpdates([{ lineIndex: 0, fields: { amount: "12" } }]),
    ).toBeNull();
    expect(
      parseLineItemEditUpdates([{ lineIndex: 0, fields: { amount: Number.NaN } }]),
    ).toBeNull();
    expect(
      parseLineItemEditUpdates([{ lineIndex: -1, fields: { amount: 1 } }]),
    ).toBeNull();
  });
});

describe("applyLineEditUpdates", () => {
  it("sets and clears fields on targeted lines only", () => {
    const items: ExtractedLineItem[] = [
      { description: "A", amount: 10, reference: "REF-1", status: "APPROVED" },
      { description: "B", amount: 20 },
    ];

    const updated = applyLineEditUpdates(items, [
      { lineIndex: 0, fields: { amount: 15, reference: null } },
    ]);

    expect(updated[0]).toEqual({ description: "A", amount: 15, status: "APPROVED" });
    expect(updated[1]).toEqual(items[1]);
  });

  it("applies the same fields to many lines and ignores out-of-range indexes", () => {
    const items: ExtractedLineItem[] = [{ description: "A" }, { description: "B" }];

    const updated = applyLineEditUpdates(items, [
      { lineIndex: 0, fields: { serviceType: "Freight" } },
      { lineIndex: 1, fields: { serviceType: "Freight" } },
      { lineIndex: 5, fields: { serviceType: "Freight" } },
    ]);

    expect(updated.map((item) => item.serviceType)).toEqual(["Freight", "Freight"]);
  });
});

describe("parseRejectedLineIndexes", () => {
  it("treats a missing payload as no deselections", () => {
    expect(parseRejectedLineIndexes(undefined)).toEqual([]);
  });

  it("sorts and deduplicates valid indexes", () => {
    expect(parseRejectedLineIndexes([3, 0, 3, 1])).toEqual([0, 1, 3]);
    expect(parseRejectedLineIndexes([])).toEqual([]);
  });

  it("rejects non-arrays, non-integers, and negatives", () => {
    expect(parseRejectedLineIndexes(null)).toBeNull();
    expect(parseRejectedLineIndexes("0,1")).toBeNull();
    expect(parseRejectedLineIndexes([0.5])).toBeNull();
    expect(parseRejectedLineIndexes(["1"])).toBeNull();
    expect(parseRejectedLineIndexes([-1])).toBeNull();
  });
});

describe("applyRejectedLineIndexes", () => {
  it("marks only the deselected lines rejected", () => {
    const items: ExtractedLineItem[] = [
      { description: "A" },
      { description: "B" },
      { description: "C" },
    ];

    const updated = applyRejectedLineIndexes(items, [1]);

    expect(updated.map((item) => item.status)).toEqual([undefined, "REJECTED", undefined]);
  });

  it("returns the input untouched when nothing is deselected", () => {
    const items: ExtractedLineItem[] = [{ description: "A" }];
    expect(applyRejectedLineIndexes(items, [])).toBe(items);
  });

  it("ignores out-of-range indexes", () => {
    const items: ExtractedLineItem[] = [{ description: "A" }];
    expect(applyRejectedLineIndexes(items, [5])[0].status).toBeUndefined();
  });
});

describe("setAllLineItemStatuses", () => {
  it("sets every line to the same status", () => {
    const items: ExtractedLineItem[] = [{ description: "A" }, { description: "B" }];
    expect(setAllLineItemStatuses(items, "APPROVED").every((item) => item.status === "APPROVED")).toBe(
      true,
    );
  });
});
