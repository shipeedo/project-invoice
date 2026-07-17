import { and, count, eq, inArray } from "drizzle-orm";
import { OPEN_CREDIT_STATUSES } from "@/lib/credit-line-utils";
import {
  creditRequests,
  db,
  emailThreads,
  invoices,
  processingJobs,
} from "@/lib/db";
import { getInvoiceDeadlineSignals } from "@/lib/invoice-deadlines";
import { invoiceInVisibleTrash, invoiceNotDeleted } from "@/lib/invoice-trash";

/** Counts behind each Invoices sidebar shortcut, matching the table filters. */
export type InvoiceFilterCounts = {
  /** Assigned to the user and not yet approved (the sidebar view hides Approved). */
  assignedToMe: number;
  overdue: number;
  dueTomorrow: number;
  draft: number;
  pending: number;
  approved: number;
  all: number;
};

export type NavCounts = {
  invoices: number;
  inbox: number;
  trash: number;
  credits: number;
  /** Jobs still needing attention: pending, in flight, or failed. */
  processing: number;
  invoiceFilters: InvoiceFilterCounts;
};

export async function getNavCounts(
  organizationId: string,
  userId?: string,
): Promise<NavCounts> {
  const orgFilter = eq(invoices.organizationId, organizationId);
  const now = new Date();

  const [invoiceRows, inboxRow, trashRow, creditsRow, processingRow] = await Promise.all([
    // The Invoices shortcuts need per-category counts, some of which (overdue,
    // due tomorrow) depend on the same deadline logic the table runs, so load
    // the rows and derive every count in one pass rather than N SQL queries.
    db.query.invoices.findMany({
      where: and(orgFilter, invoiceNotDeleted()),
      columns: {
        status: true,
        assignedToId: true,
        createdAt: true,
        validatedAt: true,
        dueDate: true,
        respondByDate: true,
      },
    }),
    db
      .select({ value: count() })
      .from(emailThreads)
      .where(eq(emailThreads.organizationId, organizationId)),
    db
      .select({ value: count() })
      .from(invoices)
      .where(and(orgFilter, invoiceInVisibleTrash())),
    db
      .select({ value: count() })
      .from(creditRequests)
      .where(
        and(
          eq(creditRequests.organizationId, organizationId),
          inArray(creditRequests.status, OPEN_CREDIT_STATUSES),
        ),
      ),
    db
      .select({ value: count() })
      .from(processingJobs)
      .where(
        and(
          eq(processingJobs.organizationId, organizationId),
          inArray(processingJobs.status, ["PENDING", "PROCESSING", "FAILED"]),
        ),
      ),
  ]);

  const invoiceFilters: InvoiceFilterCounts = {
    assignedToMe: 0,
    overdue: 0,
    dueTomorrow: 0,
    draft: 0,
    pending: 0,
    approved: 0,
    all: invoiceRows.length,
  };

  for (const row of invoiceRows) {
    if (userId && row.assignedToId === userId && row.status !== "APPROVED") {
      invoiceFilters.assignedToMe++;
    }
    if (row.status === "DRAFT") invoiceFilters.draft++;
    else if (row.status === "PENDING_APPROVAL") invoiceFilters.pending++;
    else if (row.status === "APPROVED") invoiceFilters.approved++;

    const signals = getInvoiceDeadlineSignals(row, now);
    if (signals.some((signal) => signal.urgency === "overdue")) {
      invoiceFilters.overdue++;
    }
    if (signals.some((signal) => signal.urgency === "due_tomorrow")) {
      invoiceFilters.dueTomorrow++;
    }
  }

  return {
    invoices: invoiceFilters.all,
    inbox: inboxRow[0]?.value ?? 0,
    trash: trashRow[0]?.value ?? 0,
    credits: creditsRow[0]?.value ?? 0,
    processing: processingRow[0]?.value ?? 0,
    invoiceFilters,
  };
}
