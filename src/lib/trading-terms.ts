const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Normalise a trading-term value to a positive whole number of days, or null. */
export function normalizeTradingTermDays(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const days = Math.trunc(value);
  return days > 0 ? days : null;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export type ResolvedDueDate = {
  /** The due date to store on the invoice. */
  dueDate: Date | null;
  /**
   * The due date stated on the invoice document, retained only when trading
   * terms replaced it with a different value. Null when no override happened.
   */
  originalDueDate: Date | null;
  /** True when trading terms replaced a stated due date with a different one. */
  overridden: boolean;
  /** The applied trading-term days, or null when terms were not applied. */
  tradingTermDays: number | null;
};

/**
 * Resolve the effective due date for an invoice. When the supplier has trading
 * terms and the invoice has an invoice date, the due date is computed as
 * invoiceDate + termDays, ignoring the due date stated on the document. If a
 * different due date was stated, it is retained as `originalDueDate` so the
 * override can be surfaced to the user.
 */
export function resolveDueDate(params: {
  invoiceDate: Date | null;
  extractedDueDate: Date | null;
  tradingTermDays: number | null | undefined;
}): ResolvedDueDate {
  const { invoiceDate, extractedDueDate } = params;
  const tradingTermDays = normalizeTradingTermDays(params.tradingTermDays);

  if (!tradingTermDays || !invoiceDate) {
    return {
      dueDate: extractedDueDate,
      originalDueDate: null,
      overridden: false,
      tradingTermDays,
    };
  }

  const computed = addDays(invoiceDate, tradingTermDays);
  const overridden =
    extractedDueDate != null && !isSameDay(extractedDueDate, computed);

  return {
    dueDate: computed,
    originalDueDate: overridden ? extractedDueDate : null,
    overridden,
    tradingTermDays,
  };
}
