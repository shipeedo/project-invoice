import type { InvoiceStatus } from "@/lib/db/types";
import { formatCurrency, statusLabel } from "@/lib/format";

export const RESPOND_BY_BUSINESS_DAYS = 5;
export const NEARING_BUSINESS_DAYS = 2;

// Statuses where someone still needs to review/decide, so the respond-by
// deadline applies. ON_HOLD is deliberately paused and excluded.
export const ACTIONABLE_STATUSES = ["DRAFT", "PENDING_APPROVAL"] as const;

// Statuses where the payment due date no longer matters.
export const TERMINAL_STATUSES = ["REJECTED", "PAID", "CANCELLED"] as const;

export type DeadlineUrgency =
  | "overdue"
  | "due_today"
  | "due_tomorrow"
  | "due_next_business_day"
  | "nearing"
  | "ok";

export type DeadlineKind = "respond" | "due";

export type DeadlineSignal = {
  kind: DeadlineKind;
  date: Date;
  urgency: DeadlineUrgency;
  label: string;
};

export type InvoiceDeadlineInput = {
  status: InvoiceStatus;
  createdAt: Date | string;
  validatedAt?: Date | string | null;
  dueDate?: Date | string | null;
  respondByDate?: Date | string | null;
};

export type InvoiceSearchInput = InvoiceDeadlineInput & {
  id: string;
  vendorName?: string | null;
  invoiceNumber?: string | null;
  originalFileName?: string | null;
  emailSubject?: string | null;
  totalAmount?: number | null;
  currency?: string | null;
  assignedToId?: string | null;
  supplierId?: string | null;
  assignedTo?: { name?: string | null; email?: string | null } | null;
  supplier?: { name?: string | null } | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function isWeekend(value: Date): boolean {
  const day = value.getDay();
  return day === 0 || day === 6;
}

export function addBusinessDays(from: Date, days: number): Date {
  let current = startOfDay(from);
  let added = 0;
  while (added < days) {
    current = new Date(current);
    current.setDate(current.getDate() + 1);
    if (!isWeekend(current)) added++;
  }
  return current;
}

export function nextBusinessDay(from: Date): Date {
  return addBusinessDays(startOfDay(from), 1);
}

export function isActionableStatus(status: InvoiceStatus): boolean {
  return (ACTIONABLE_STATUSES as readonly string[]).includes(status);
}

export function isTerminalStatus(status: InvoiceStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function getRespondByDate(invoice: InvoiceDeadlineInput): Date | null {
  if (!isActionableStatus(invoice.status)) return null;

  // A respond-by deadline stated on the invoice itself wins over the
  // policy default derived from validation/receipt.
  const explicit = toDate(invoice.respondByDate);
  if (explicit) return startOfDay(explicit);

  const anchor = toDate(invoice.validatedAt) ?? toDate(invoice.createdAt);
  if (!anchor) return null;

  return addBusinessDays(anchor, RESPOND_BY_BUSINESS_DAYS);
}

export function getDueDate(invoice: InvoiceDeadlineInput): Date | null {
  return toDate(invoice.dueDate);
}

export function classifyDeadline(
  deadline: Date,
  now = new Date(),
  nearingBusinessDays = NEARING_BUSINESS_DAYS,
): DeadlineUrgency {
  const today = startOfDay(now);
  const target = startOfDay(deadline);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextBiz = nextBusinessDay(today);

  if (target < today) return "overdue";
  if (target.getTime() === today.getTime()) return "due_today";
  if (target.getTime() === tomorrow.getTime()) return "due_tomorrow";
  if (target.getTime() === nextBiz.getTime()) return "due_next_business_day";

  const nearingLimit = addBusinessDays(today, nearingBusinessDays);
  if (target <= nearingLimit) return "nearing";

  return "ok";
}

function urgencyLabel(kind: DeadlineKind, urgency: DeadlineUrgency): string {
  const prefix = kind === "respond" ? "Respond" : "Due";
  switch (urgency) {
    case "overdue":
      return `${prefix} overdue`;
    case "due_today":
      return `${prefix} today`;
    case "due_tomorrow":
      return `${prefix} tomorrow`;
    case "due_next_business_day":
      return `${prefix} next business day`;
    case "nearing":
      return `Nearing ${kind === "respond" ? "respond-by" : "due date"}`;
    default:
      return prefix;
  }
}

export function getInvoiceDeadlineSignals(
  invoice: InvoiceDeadlineInput,
  now = new Date(),
): DeadlineSignal[] {
  const signals: DeadlineSignal[] = [];

  const respondBy = getRespondByDate(invoice);
  if (respondBy) {
    const urgency = classifyDeadline(respondBy, now);
    if (urgency !== "ok") {
      signals.push({
        kind: "respond",
        date: respondBy,
        urgency,
        label: urgencyLabel("respond", urgency),
      });
    }
  }

  if (!isTerminalStatus(invoice.status)) {
    const due = getDueDate(invoice);
    if (due) {
      const urgency = classifyDeadline(due, now);
      if (urgency !== "ok") {
        signals.push({
          kind: "due",
          date: due,
          urgency,
          label: urgencyLabel("due", urgency),
        });
      }
    }
  }

  return signals;
}

const URGENT_URGENCIES: DeadlineUrgency[] = [
  "overdue",
  "due_today",
  "due_tomorrow",
  "due_next_business_day",
];

export function isUrgentInvoice(
  invoice: InvoiceDeadlineInput,
  now = new Date(),
): boolean {
  return getInvoiceDeadlineSignals(invoice, now).some((signal) =>
    URGENT_URGENCIES.includes(signal.urgency),
  );
}

export function needsMyUrgentAttention(
  invoice: InvoiceSearchInput,
  userId: string,
  now = new Date(),
): boolean {
  if (invoice.assignedToId !== userId) return false;
  return isUrgentInvoice(invoice, now);
}

function formatDateForSearch(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(date);
}

function parseAmountQuery(query: string): number | null {
  const normalized = query.replace(/[$,\s]/g, "");
  if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseDateQuery(query: string): Date | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const date = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
    );
    return Number.isNaN(date.getTime()) ? null : startOfDay(date);
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmyMatch) {
    const year =
      dmyMatch[3].length === 2
        ? 2000 + Number(dmyMatch[3])
        : Number(dmyMatch[3]);
    const date = new Date(year, Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
    return Number.isNaN(date.getTime()) ? null : startOfDay(date);
  }

  return null;
}

function datesMatchQuery(
  invoice: InvoiceSearchInput,
  queryDate: Date,
): boolean {
  const dates = [
    toDate(invoice.createdAt),
    toDate(invoice.validatedAt),
    getRespondByDate(invoice),
    getDueDate(invoice),
    toDate(invoice.dueDate),
  ].filter((value): value is Date => value !== null);

  return dates.some(
    (date) => startOfDay(date).getTime() === queryDate.getTime(),
  );
}

export function matchesInvoiceSearch(
  invoice: InvoiceSearchInput,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const amountQuery = parseAmountQuery(query);
  if (amountQuery != null && invoice.totalAmount != null) {
    if (Math.abs(invoice.totalAmount - amountQuery) < 0.01) return true;
  }

  const dateQuery = parseDateQuery(query);
  if (dateQuery && datesMatchQuery(invoice, dateQuery)) return true;

  const fields = [
    invoice.vendorName,
    invoice.invoiceNumber,
    invoice.originalFileName,
    invoice.emailSubject,
    invoice.supplier?.name,
    invoice.assignedTo?.name,
    invoice.assignedTo?.email,
    statusLabel(invoice.status),
    invoice.totalAmount != null
      ? formatCurrency(invoice.totalAmount, invoice.currency ?? "AUD")
      : null,
    formatDateForSearch(invoice.createdAt),
    formatDateForSearch(invoice.validatedAt),
    formatDateForSearch(getRespondByDate(invoice)),
    formatDateForSearch(getDueDate(invoice)),
    formatDateForSearch(invoice.dueDate),
  ].filter((value): value is string => Boolean(value?.trim()));

  return fields.some((field) => field.toLowerCase().includes(normalized));
}

export type UrgencyFilter =
  | "all"
  | "needs_my_attention"
  | "overdue"
  | "nearing_respond"
  | "nearing_due";

export function matchesUrgencyFilter(
  invoice: InvoiceSearchInput,
  filter: UrgencyFilter,
  userId: string,
  now = new Date(),
): boolean {
  if (filter === "all") return true;

  const signals = getInvoiceDeadlineSignals(invoice, now);

  switch (filter) {
    case "needs_my_attention":
      return needsMyUrgentAttention(invoice, userId, now);
    case "overdue":
      return signals.some((signal) => signal.urgency === "overdue");
    case "nearing_respond":
      return signals.some(
        (signal) =>
          signal.kind === "respond" &&
          ["nearing", "due_tomorrow", "due_next_business_day", "due_today"].includes(
            signal.urgency,
          ),
      );
    case "nearing_due":
      return signals.some(
        (signal) =>
          signal.kind === "due" &&
          ["nearing", "due_tomorrow", "due_next_business_day", "due_today"].includes(
            signal.urgency,
          ),
      );
    default:
      return true;
  }
}

export function formatDateOnly(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(date);
}
