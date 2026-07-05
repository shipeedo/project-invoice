import { formatCurrency, statusLabel } from "@/lib/format";

export type AuditDisplay = {
  label: string;
  description: string | null;
};

type Details = Record<string, unknown>;

type LineDecisionDetail = {
  lineIndex?: number;
  lineNumber?: number;
  description?: string | null;
  status?: string;
};

function parseDetails(raw: string | null | undefined): Details {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Details) : {};
  } catch {
    return {};
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function lineRef(decision: LineDecisionDetail): string {
  const number = decision.lineNumber ?? (decision.lineIndex != null ? decision.lineIndex + 1 : null);
  const description = asString(decision.description);
  if (description && number != null) return `line ${number} “${description}”`;
  if (description) return `“${description}”`;
  if (number != null) return `line ${number}`;
  return "a line item";
}

function describeLineDecisions(details: Details): AuditDisplay {
  const decisions = Array.isArray(details.decisions)
    ? (details.decisions as LineDecisionDetail[])
    : [];

  const approved = decisions.filter((decision) => decision.status === "APPROVED");
  const rejected = decisions.filter((decision) => decision.status === "REJECTED");

  const label =
    approved.length > 0 && rejected.length === 0
      ? "Line items approved"
      : rejected.length > 0 && approved.length === 0
        ? "Line items rejected"
        : "Line item decisions updated";

  const parts: string[] = [];
  if (approved.length > 0) {
    parts.push(`Approved ${approved.map(lineRef).join(", ")}`);
  }
  if (rejected.length > 0) {
    parts.push(`Rejected ${rejected.map(lineRef).join(", ")}`);
  }

  const invoiceStatus = asString(details.status);
  if (invoiceStatus) {
    parts.push(`Invoice status: ${statusLabel(invoiceStatus)}`);
  }

  return { label, description: parts.length > 0 ? parts.join(" · ") : null };
}

function describeLineEdits(details: Details): AuditDisplay {
  const edits = Array.isArray(details.edits)
    ? (details.edits as Array<{ lineIndex?: number; fields?: Details }>)
    : [];

  const parts = edits.map((edit) => {
    const line = edit.lineIndex != null ? `Line ${edit.lineIndex + 1}` : "Line";
    const fields = edit.fields ? Object.keys(edit.fields).join(", ") : "";
    return fields ? `${line}: ${fields}` : line;
  });

  return {
    label: "Line items edited",
    description: parts.length > 0 ? parts.join(" · ") : null,
  };
}

function describeLineAssignments(details: Details): AuditDisplay {
  const assignments = Array.isArray(details.assignments)
    ? (details.assignments as Array<{ lineIndex?: number; assignedToId?: string | null }>)
    : [];

  const lines = assignments
    .map((assignment) =>
      assignment.lineIndex != null ? `line ${assignment.lineIndex + 1}` : null,
    )
    .filter((value): value is string => value !== null);

  return {
    label: "Line assignees updated",
    description: lines.length > 0 ? `Changed assignee on ${lines.join(", ")}` : null,
  };
}

function withNote(base: string | null, details: Details): string | null {
  const note = asString(details.note);
  if (!base) return note ? `Note: ${note}` : null;
  return note ? `${base} · Note: ${note}` : base;
}

function describePayment(details: Details, currency: string, paidInFull: boolean): AuditDisplay {
  const amount = asNumber(details.amount);
  const amountPaid = asNumber(details.amountPaid);
  const ref = asString(details.transactionRef);

  const parts: string[] = [];
  if (amount != null) parts.push(`${formatCurrency(amount, currency)} recorded`);
  if (amountPaid != null) parts.push(`total paid ${formatCurrency(amountPaid, currency)}`);
  if (ref) parts.push(`ref ${ref}`);

  return {
    label: paidInFull ? "Invoice paid in full" : "Payment recorded",
    description: withNote(parts.length > 0 ? parts.join(" · ") : null, details),
  };
}

export function describeAuditEvent(
  action: string,
  rawDetails: string | null | undefined,
  currency = "AUD",
): AuditDisplay {
  const details = parseDetails(rawDetails);

  switch (action) {
    case "invoice.received": {
      const fileName = asString(details.fileName);
      const sourceType = asString(details.sourceType);
      return {
        label: "Invoice received",
        description:
          fileName ?? (sourceType === "EMAIL" ? "Received via email" : null),
      };
    }
    case "invoice.extracted":
      return { label: "Invoice data extracted", description: null };
    case "invoice.parse_failed":
      return {
        label: "Extraction failed",
        description: asString(details.parseError),
      };
    case "invoice.validated":
      return { label: "Invoice validated", description: null };
    case "invoice.routed": {
      const assignee = asString(details.assignedToEmail);
      return {
        label: "Routed for approval",
        description: assignee ? `Assigned to ${assignee}` : null,
      };
    }
    case "invoice.approved": {
      const count = asNumber(details.lineItemCount);
      return {
        label: "Invoice approved",
        description: withNote(
          count ? `All ${count} line item${count === 1 ? "" : "s"} marked approved` : null,
          details,
        ),
      };
    }
    case "invoice.rejected": {
      const count = asNumber(details.lineItemCount);
      return {
        label: "Invoice rejected",
        description: withNote(
          count ? `All ${count} line item${count === 1 ? "" : "s"} marked rejected` : null,
          details,
        ),
      };
    }
    case "invoice.line_decisions_updated":
      return describeLineDecisions(details);
    case "invoice.line_items_edited":
      return describeLineEdits(details);
    case "invoice.line_assignments_updated":
      return describeLineAssignments(details);
    case "invoice.held": {
      const reason = asString(details.reason);
      return {
        label: "Placed on hold",
        description: reason ? `Reason: ${reason}` : null,
      };
    }
    case "invoice.hold_released": {
      const restored = asString(details.restoredStatus);
      return {
        label: "Hold released",
        description: restored ? `Status restored to ${statusLabel(restored)}` : null,
      };
    }
    case "invoice.cancelled": {
      const reason = asString(details.reason);
      return {
        label: "Invoice cancelled",
        description: reason ? `Reason: ${reason}` : null,
      };
    }
    case "invoice.payment_recorded":
      return describePayment(details, currency, false);
    case "invoice.paid":
      return describePayment(details, currency, true);
    default:
      // Fallback: "invoice.some_action" → "Some action".
      return {
        label: statusLabel(action.replace(/^invoice\./, "").replace(/\./g, "_")),
        description: null,
      };
  }
}
