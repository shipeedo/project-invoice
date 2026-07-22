import { formatCurrency, formatDate, statusLabel } from "@/lib/format";

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
    case "invoice.viewed":
      return { label: "Invoice viewed", description: null };
    case "invoice.reprocessed": {
      const parseError = asString(details.parseError);
      const sourceType = asString(details.sourceType);
      return {
        label: "Invoice re-processed",
        description: parseError
          ? `Extraction failed: ${parseError}`
          : sourceType === "EMAIL"
            ? "Extraction re-run on the linked email's attachments"
            : "Extraction re-run on the uploaded file",
      };
    }
    case "invoice.parse_failed":
      return {
        label: "Extraction failed",
        description: asString(details.parseError),
      };
    case "invoice.supplier_linked": {
      const supplierName = asString(details.supplierName);
      const created = details.created === true;
      return {
        label: created ? "Supplier created and linked" : "Supplier linked",
        description: supplierName
          ? created
            ? `Created ${supplierName} from the confirmed details`
            : `Linked to ${supplierName}`
          : null,
      };
    }
    case "invoice.validated": {
      const rejectedCount = asNumber(details.rejectedLineCount);
      const parts = [
        rejectedCount
          ? `${rejectedCount} line item${rejectedCount === 1 ? "" : "s"} deselected and marked rejected`
          : null,
        asString(details.totalsSource) === "LINE_ITEMS"
          ? "Totals calculated from the selected line items"
          : null,
      ].filter(Boolean);
      return {
        label: "Invoice validated",
        description: parts.length > 0 ? parts.join(" · ") : null,
      };
    }
    case "invoice.due_date_overridden": {
      const days = asNumber(details.tradingTermDays);
      const original = asString(details.originalDueDate);
      const parts = [
        days != null ? `Applied ${days}-day trading terms` : "Applied supplier trading terms",
        original ? `invoice stated ${formatDate(original)}` : null,
      ].filter(Boolean);
      return {
        label: "Due date overridden",
        description: parts.length > 0 ? parts.join(" · ") : null,
      };
    }
    case "invoice.routed": {
      const assignee = asString(details.assignedToEmail);
      return {
        label: "Routed for approval",
        description: assignee ? `Assigned to ${assignee}` : null,
      };
    }
    case "invoice.assigned": {
      const assignee = asString(details.assignedToEmail);
      return {
        label: "Assignee changed",
        description: assignee ? `Assigned to ${assignee}` : "Assignment removed",
      };
    }
    case "notification.sent": {
      const recipient = asString(details.recipientEmail);
      const type = asString(details.type);
      return {
        label: "Notification sent",
        description: recipient
          ? `Notified ${recipient}${type ? ` (${statusLabel(type)})` : ""}`
          : null,
      };
    }
    case "notification.reminder_sent": {
      const recipient = asString(details.recipientEmail);
      return {
        label: "Reminder sent",
        description: withNote(
          recipient ? `Reminder sent to ${recipient}` : null,
          details,
        ),
      };
    }
    case "notification.test_sent": {
      const recipient = asString(details.recipientEmail);
      return {
        label: "Test notification sent",
        description: recipient ? `Test sent to ${recipient}` : null,
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
    case "invoice.deleted": {
      const reason = asString(details.reason);
      return {
        label: "Moved to trash",
        description: reason ? `Reason: ${reason}` : null,
      };
    }
    case "invoice.restored":
      return { label: "Restored from trash", description: null };
    case "email.invoice_created": {
      const subject = asString(details.subject);
      return {
        label: "Invoice created from email",
        description: subject ? `Subject: ${subject}` : null,
      };
    }
    case "email.ignored": {
      const reason = asString(details.ignoreReason);
      const subject = asString(details.subject);
      const parts = [reason ? `Reason: ${reason.replace(/_/g, " ")}` : null, subject ? `Subject: ${subject}` : null].filter(
        Boolean,
      );
      return {
        label: "Email ignored",
        description: parts.length > 0 ? parts.join(" · ") : null,
      };
    }
    case "credit_request.created": {
      const count = asNumber(details.lineCount);
      const total = asNumber(details.requestedTotal);
      const parts = [
        count ? `${count} line${count === 1 ? "" : "s"}` : null,
        total != null ? `requested ${formatCurrency(total, currency)}` : null,
      ].filter(Boolean);
      return {
        label: "Credit request created",
        description: parts.length > 0 ? parts.join(" · ") : null,
      };
    }
    case "credit_request.sent":
      return {
        label: "Credit request sent",
        description: asString(details.recipientEmail)
          ? `To ${details.recipientEmail}`
          : null,
      };
    case "invoice.documents_added": {
      const fileNames = Array.isArray(details.fileNames)
        ? details.fileNames.filter((name): name is string => typeof name === "string")
        : [];
      const kind = asString(details.kind);
      return {
        label: kind === "CREDIT" ? "Credit note attached" : "Documents added",
        description: fileNames.length > 0 ? fileNames.join(", ") : null,
      };
    }
    case "invoice.document_removed":
      return {
        label: "Document removed",
        description: asString(details.fileName),
      };
    case "invoice.rebilled": {
      const customer = asString(details.customerName);
      const reference = asString(details.reference);
      const parts = [
        customer ? `Rebilled to ${customer}` : null,
        reference ? `Reference: ${reference}` : null,
      ].filter(Boolean);
      return {
        label: "Invoice rebilled",
        description: parts.length > 0 ? parts.join(" · ") : null,
      };
    }
    case "credit_request.updated": {
      const status = asString(details.status);
      const approved = asNumber(details.approvedAmount);
      const fileNames = Array.isArray(details.fileNames)
        ? details.fileNames.filter((name): name is string => typeof name === "string")
        : [];
      const parts = [
        status ? `Status: ${statusLabel(status)}` : null,
        approved != null ? `Approved ${formatCurrency(approved, currency)}` : null,
        fileNames.length > 0 ? `Credit note: ${fileNames.join(", ")}` : null,
      ].filter(Boolean);
      return {
        label: "Credit request updated",
        description: parts.length > 0 ? parts.join(" · ") : null,
      };
    }
    default:
      // Fallback: "invoice.some_action" → "Some action".
      return {
        label: statusLabel(action.replace(/^invoice\./, "").replace(/\./g, "_")),
        description: null,
      };
  }
}
