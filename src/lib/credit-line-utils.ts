import type { CreditRequestStatus } from "@/lib/db/types";
import type { CreditReasonCode } from "@/lib/credit-reasons";
import { isCreditReasonCode } from "@/lib/credit-reasons";
import type { ExtractedLineItem, LineItemStatus } from "@/lib/extraction";
import { roundToTwoDecimals } from "@/lib/format";

export type CreditRequestLineItem = {
  lineIndex: number;
  lineNumber?: number;
  description: string;
  serviceType?: string | null;
  reference?: string | null;
  invoiceAmount?: number | null;
  requestedAmount?: number | null;
  reason?: CreditReasonCode | null;
  reasonDetail?: string | null;
};

export type CreateCreditLineInput = {
  lineIndex: number;
  requestedAmount?: number | null;
  reason: CreditReasonCode;
  reasonDetail?: string | null;
};

export const OPEN_CREDIT_STATUSES: CreditRequestStatus[] = [
  "DRAFT",
  "SENT",
  "AWAITING_USER",
  "CONTESTED",
];

export function parseCreditRequestLineItems(
  raw: string | null | undefined,
): CreditRequestLineItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CreditRequestLineItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isCreditRequestOpen(status: CreditRequestStatus) {
  return OPEN_CREDIT_STATUSES.includes(status);
}

export function canRequestCreditForLine(status: LineItemStatus) {
  return status !== "CREDIT_PENDING" && status !== "CREDIT_APPROVED";
}

export function sumRequestedAmounts(lineItems: CreditRequestLineItem[]) {
  return lineItems.reduce((total, line) => total + (line.requestedAmount ?? 0), 0);
}

export const GST_RATE = 0.1;

export function isFuelLine(
  line: Pick<ExtractedLineItem, "description" | "serviceType">,
) {
  return /fuel/i.test(line.serviceType ?? "") || /fuel/i.test(line.description);
}

/**
 * Fuel levy rate implied by the invoice: fuel charges over non-fuel charges.
 * Null when the invoice has no usable fuel or base amounts.
 */
export function computeInvoiceFuelRate(
  invoiceLines: ExtractedLineItem[],
): number | null {
  let fuelTotal = 0;
  let baseTotal = 0;
  for (const line of invoiceLines) {
    if (line.amount == null || !Number.isFinite(line.amount)) continue;
    if (isFuelLine(line)) {
      fuelTotal += line.amount;
    } else {
      baseTotal += line.amount;
    }
  }
  if (fuelTotal <= 0 || baseTotal <= 0) return null;
  return fuelTotal / baseTotal;
}

/** Parses a user-entered fuel levy percentage into a fraction, e.g. "10.39" → 0.1039. */
export function parseFuelRatePercent(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) return null;
  return parsed / 100;
}

/**
 * Fuel component of a credit request: the fuel rate applied to the requested
 * amounts of the selected non-fuel lines. Fuel lines credited directly are
 * excluded so their amount is never doubled. The rate derives from the
 * invoice unless the user supplied their own via rateOverride.
 */
export function computeFuelCreditAmount(
  invoiceLines: ExtractedLineItem[],
  lines: Array<{ lineIndex: number; requestedAmount?: number | null }>,
  rateOverride?: number | null,
): number | null {
  const rate = rateOverride ?? computeInvoiceFuelRate(invoiceLines);
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;

  const base = lines.reduce((sum, line) => {
    const invoiceLine = invoiceLines[line.lineIndex];
    if (!invoiceLine || isFuelLine(invoiceLine)) return sum;
    return sum + (line.requestedAmount ?? 0);
  }, 0);

  if (base <= 0) return null;
  return roundToTwoDecimals(base * rate);
}

export function computeGstCreditAmount(subtotal: number): number | null {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return null;
  return roundToTwoDecimals(subtotal * GST_RATE);
}

export function resolveDefaultApprovedAmount(
  requestedTotal: number | null | undefined,
  lineItemsJson: string | null | undefined,
) {
  if (requestedTotal != null && requestedTotal > 0) return requestedTotal;
  const sum = sumRequestedAmounts(parseCreditRequestLineItems(lineItemsJson));
  return sum > 0 ? sum : null;
}

export function parseCreateCreditLinesInput(raw: unknown): CreateCreditLineInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const lines: CreateCreditLineInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { lineIndex, requestedAmount, reason, reasonDetail } = entry as {
      lineIndex?: unknown;
      requestedAmount?: unknown;
      reason?: unknown;
      reasonDetail?: unknown;
    };
    if (!Number.isInteger(lineIndex) || (lineIndex as number) < 0) return null;
    if (typeof reason !== "string" || !isCreditReasonCode(reason)) return null;
    if (
      requestedAmount !== undefined &&
      requestedAmount !== null &&
      (typeof requestedAmount !== "number" || !Number.isFinite(requestedAmount))
    ) {
      return null;
    }
    if (reasonDetail != null && typeof reasonDetail !== "string") return null;
    if (reason === "OTHER" && !String(reasonDetail ?? "").trim()) return null;

    lines.push({
      lineIndex: lineIndex as number,
      reason,
      reasonDetail:
        reasonDetail == null ? null : String(reasonDetail).trim() || null,
      requestedAmount:
        requestedAmount === undefined
          ? undefined
          : requestedAmount === null
            ? null
            : (requestedAmount as number),
    });
  }

  return lines;
}

export function buildCreditRequestLineItems(
  invoiceLines: ExtractedLineItem[],
  inputs: CreateCreditLineInput[],
): CreditRequestLineItem[] | null {
  const result: CreditRequestLineItem[] = [];

  for (const input of inputs) {
    const line = invoiceLines[input.lineIndex];
    if (!line) return null;

    const status = line.status ?? "PENDING";
    if (!canRequestCreditForLine(status)) return null;

    result.push({
      lineIndex: input.lineIndex,
      lineNumber: line.lineNumber ?? input.lineIndex + 1,
      description: line.description,
      serviceType: line.serviceType ?? null,
      reference: line.reference ?? null,
      invoiceAmount: line.amount ?? null,
      requestedAmount:
        input.requestedAmount === undefined
          ? (line.amount ?? null)
          : input.requestedAmount,
      reason: input.reason,
      reasonDetail: input.reasonDetail ?? null,
    });
  }

  return result;
}

export function markLinesCreditPending(
  invoiceLines: ExtractedLineItem[],
  creditLines: CreditRequestLineItem[],
  creditRequestId: string,
): ExtractedLineItem[] {
  const indices = new Set(creditLines.map((line) => line.lineIndex));
  return invoiceLines.map((line, index) =>
    indices.has(index)
      ? { ...line, status: "CREDIT_PENDING", creditRequestId }
      : line,
  );
}

export function applyCreditOutcomeToLines(
  invoiceLines: ExtractedLineItem[],
  creditLines: CreditRequestLineItem[],
  outcome: "APPROVED" | "DENIED",
): ExtractedLineItem[] {
  const indices = new Set(creditLines.map((line) => line.lineIndex));
  return invoiceLines.map((line, index) => {
    if (!indices.has(index)) return line;
    return {
      ...line,
      status: outcome === "APPROVED" ? "CREDIT_APPROVED" : "CREDIT_DENIED",
    };
  });
}
