import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  classifyDeadline,
  getInvoiceDeadlineSignals,
  getRespondByDate,
  isUrgentInvoice,
  matchesInvoiceSearch,
  needsMyUrgentAttention,
  nextBusinessDay,
} from "@/lib/invoice-deadlines";

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    const friday = new Date(2026, 6, 3);
    expect(addBusinessDays(friday, 1).getDay()).toBe(1);
  });
});

describe("getRespondByDate", () => {
  it("adds business days from validatedAt", () => {
    const validatedAt = new Date(2026, 6, 1);
    const respondBy = getRespondByDate({
      status: "PENDING_APPROVAL",
      createdAt: new Date(2026, 5, 30),
      validatedAt,
    });
    expect(respondBy).toEqual(addBusinessDays(validatedAt, 5));
  });

  it("prefers a respond-by date stated on the invoice over the derived default", () => {
    const respondBy = getRespondByDate({
      status: "PENDING_APPROVAL",
      createdAt: new Date(2026, 5, 30),
      validatedAt: new Date(2026, 6, 1),
      respondByDate: new Date(2026, 6, 20, 14, 30),
    });
    expect(respondBy).toEqual(new Date(2026, 6, 20));
  });

  it("returns null once the invoice is no longer actionable", () => {
    expect(
      getRespondByDate({
        status: "APPROVED",
        createdAt: new Date(),
      }),
    ).toBeNull();
    expect(
      getRespondByDate({
        status: "ON_HOLD",
        createdAt: new Date(),
      }),
    ).toBeNull();
  });
});

describe("classifyDeadline", () => {
  const today = new Date(2026, 6, 3);

  it("marks past dates overdue", () => {
    expect(classifyDeadline(new Date(2026, 6, 1), today)).toBe("overdue");
  });

  it("marks tomorrow", () => {
    expect(classifyDeadline(new Date(2026, 6, 4), today)).toBe("due_tomorrow");
  });

  it("marks next business day on Friday", () => {
    const friday = new Date(2026, 6, 3);
    const monday = nextBusinessDay(friday);
    expect(classifyDeadline(monday, friday)).toBe("due_next_business_day");
  });
});

describe("urgency helpers", () => {
  const now = new Date(2026, 6, 3);

  it("flags overdue respond-by as urgent", () => {
    const invoice = {
      status: "PENDING_APPROVAL" as const,
      createdAt: new Date(2026, 5, 20),
      validatedAt: new Date(2026, 5, 20),
      dueDate: null,
    };
    expect(isUrgentInvoice(invoice, now)).toBe(true);
    expect(getInvoiceDeadlineSignals(invoice, now)[0]?.kind).toBe("respond");
  });

  it("needs attention when assigned to user and urgent", () => {
    const invoice = {
      id: "inv-1",
      status: "PENDING_APPROVAL" as const,
      createdAt: new Date(2026, 5, 20),
      validatedAt: new Date(2026, 5, 20),
      assignedToId: "user-1",
      dueDate: null,
    };
    expect(needsMyUrgentAttention(invoice, "user-1", now)).toBe(true);
    expect(needsMyUrgentAttention(invoice, "user-2", now)).toBe(false);
  });

  it("stops flagging handled invoices even with an overdue due date", () => {
    const handled = {
      id: "inv-2",
      createdAt: new Date(2026, 5, 20),
      validatedAt: new Date(2026, 5, 20),
      assignedToId: "user-1",
      dueDate: new Date(2026, 6, 1),
    };

    for (const status of ["APPROVED", "REJECTED", "CANCELLED"] as const) {
      const invoice = { ...handled, status };
      expect(getInvoiceDeadlineSignals(invoice, now)).toEqual([]);
      expect(isUrgentInvoice(invoice, now)).toBe(false);
      expect(needsMyUrgentAttention(invoice, "user-1", now)).toBe(false);
    }

    // The same overdue due date on an unhandled invoice still alerts.
    const pending = { ...handled, status: "PENDING_APPROVAL" as const };
    expect(isUrgentInvoice(pending, now)).toBe(true);
  });
});

describe("matchesInvoiceSearch", () => {
  const invoice = {
    id: "inv-1",
    status: "PENDING_APPROVAL" as const,
    createdAt: new Date(2026, 5, 1),
    validatedAt: new Date(2026, 5, 2),
    vendorName: "Acme Freight",
    invoiceNumber: "INV-100",
    totalAmount: 1234.5,
    currency: "AUD",
    supplier: { name: "Acme Freight" },
    assignedTo: { name: "Alex", email: "alex@example.com" },
    assignedToId: "user-1",
    supplierId: "sup-1",
  };

  it("matches vendor text", () => {
    expect(matchesInvoiceSearch(invoice, "acme")).toBe(true);
  });

  it("matches amount", () => {
    expect(matchesInvoiceSearch(invoice, "$1,234.50")).toBe(true);
  });

  it("matches ISO date against invoice dates", () => {
    expect(matchesInvoiceSearch(invoice, "2026-06-02")).toBe(true);
  });
});
