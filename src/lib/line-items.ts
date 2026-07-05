import type { ExtractedLineItem, LineItemStatus } from "@/lib/extraction";
import type { InvoiceStatus } from "@/lib/db/types";

export function parseLineItems(raw: string | null | undefined): ExtractedLineItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ExtractedLineItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveLineAssigneeId(
  item: ExtractedLineItem,
  invoiceAssignedToId: string | null | undefined,
): string | null {
  if (item.assignedToId) return item.assignedToId;
  return invoiceAssignedToId ?? null;
}

export function resolveLineItemStatus(item: ExtractedLineItem): LineItemStatus {
  return item.status ?? "PENDING";
}

export function deriveInvoiceStatusFromLineItems(
  lineItems: ExtractedLineItem[],
  currentStatus: InvoiceStatus,
): InvoiceStatus {
  if (lineItems.length === 0) return currentStatus;

  const statuses = lineItems.map(resolveLineItemStatus);
  const approved = statuses.filter((status) => status === "APPROVED").length;
  const rejected = statuses.filter((status) => status === "REJECTED").length;
  const pending = statuses.filter((status) => status === "PENDING").length;
  const total = lineItems.length;

  // The invoice only resolves once every line has a decision; a mix of
  // approved and rejected lines counts as approved (the rejected lines
  // stay visible per line and feed credit requests).
  if (pending > 0) return currentStatus;
  if (rejected === total) return "REJECTED";
  if (approved > 0) return "APPROVED";

  return currentStatus;
}

export function mergeLineItemAssignments(
  existing: ExtractedLineItem[],
  incoming: ExtractedLineItem[],
): ExtractedLineItem[] {
  return incoming.map((item, index) => {
    const previous = existing[index];
    if (!previous) return item;

    const merged = { ...item };
    if (previous.assignedToId) merged.assignedToId = previous.assignedToId;
    if (previous.status && previous.status !== "PENDING") {
      merged.status = previous.status;
    }
    return merged;
  });
}

export type LineAssignmentUpdate = {
  lineIndex: number;
  assignedToId: string | null;
};

export function applyLineAssignmentUpdates(
  lineItems: ExtractedLineItem[],
  updates: LineAssignmentUpdate[],
): ExtractedLineItem[] {
  const next = lineItems.map((item) => ({ ...item }));

  for (const update of updates) {
    if (update.lineIndex < 0 || update.lineIndex >= next.length) continue;
    if (update.assignedToId) {
      next[update.lineIndex] = {
        ...next[update.lineIndex],
        assignedToId: update.assignedToId,
      };
    } else {
      const item = { ...next[update.lineIndex] };
      delete item.assignedToId;
      next[update.lineIndex] = item;
    }
  }

  return next;
}

export type LineItemEditFields = {
  description?: string;
  serviceType?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  amount?: number | null;
  reference?: string | null;
};

export type LineItemEditUpdate = {
  lineIndex: number;
  fields: LineItemEditFields;
};

function parseEditString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseEditNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Validates an untrusted request payload into edit updates.
 * Returns null when the payload is structurally invalid (bad line index,
 * non-numeric amounts, empty description, or no effective changes).
 */
export function parseLineItemEditUpdates(raw: unknown): LineItemEditUpdate[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const updates: LineItemEditUpdate[] = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { lineIndex, fields } = entry as { lineIndex?: unknown; fields?: unknown };
    if (!Number.isInteger(lineIndex) || (lineIndex as number) < 0) return null;
    if (typeof fields !== "object" || fields === null) return null;

    const candidate = fields as Record<string, unknown>;
    const parsed: LineItemEditFields = {};

    if (candidate.description !== undefined) {
      const description = parseEditString(candidate.description);
      if (!description) return null;
      parsed.description = description;
    }

    for (const key of ["serviceType", "reference"] as const) {
      if (candidate[key] === undefined) continue;
      const value = parseEditString(candidate[key]);
      if (value === undefined) return null;
      parsed[key] = value;
    }

    for (const key of ["quantity", "unitPrice", "amount"] as const) {
      if (candidate[key] === undefined) continue;
      const value = parseEditNumber(candidate[key]);
      if (value === undefined) return null;
      parsed[key] = value;
    }

    if (Object.keys(parsed).length === 0) return null;
    updates.push({ lineIndex: lineIndex as number, fields: parsed });
  }

  return updates;
}

function applyOptionalEdit<K extends "serviceType" | "reference" | "quantity" | "unitPrice" | "amount">(
  item: ExtractedLineItem,
  key: K,
  value: LineItemEditFields[K],
) {
  if (value === undefined) return;
  if (value === null) {
    delete item[key];
  } else {
    item[key] = value as ExtractedLineItem[K];
  }
}

export function applyLineEditUpdates(
  lineItems: ExtractedLineItem[],
  updates: LineItemEditUpdate[],
): ExtractedLineItem[] {
  const next = lineItems.map((item) => ({ ...item }));

  for (const update of updates) {
    if (update.lineIndex < 0 || update.lineIndex >= next.length) continue;
    const item = { ...next[update.lineIndex] };
    const { fields } = update;

    if (fields.description) item.description = fields.description;
    applyOptionalEdit(item, "serviceType", fields.serviceType);
    applyOptionalEdit(item, "reference", fields.reference);
    applyOptionalEdit(item, "quantity", fields.quantity);
    applyOptionalEdit(item, "unitPrice", fields.unitPrice);
    applyOptionalEdit(item, "amount", fields.amount);

    next[update.lineIndex] = item;
  }

  return next;
}

export type LineDecisionUpdate = {
  lineIndex: number;
  status: Exclude<LineItemStatus, "PENDING">;
};

export function applyLineDecisionUpdates(
  lineItems: ExtractedLineItem[],
  updates: LineDecisionUpdate[],
): ExtractedLineItem[] {
  const next = lineItems.map((item) => ({ ...item }));

  for (const update of updates) {
    if (update.lineIndex < 0 || update.lineIndex >= next.length) continue;
    next[update.lineIndex] = {
      ...next[update.lineIndex],
      status: update.status,
    };
  }

  return next;
}

export function setAllLineItemStatuses(
  lineItems: ExtractedLineItem[],
  status: LineItemStatus,
): ExtractedLineItem[] {
  return lineItems.map((item) => ({ ...item, status }));
}

// APPROVED is included so an approval can be adjusted afterwards —
// individual line items can still be rejected until payment starts.
export const LINE_DECISION_INVOICE_STATUSES: InvoiceStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
];

export function canDecideLineItems(params: {
  status: string;
  validatedAt?: Date | string | null;
  lineItemCount: number;
}) {
  return (
    params.lineItemCount > 0 &&
    Boolean(params.validatedAt) &&
    LINE_DECISION_INVOICE_STATUSES.includes(params.status as InvoiceStatus)
  );
}
