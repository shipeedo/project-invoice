import { and, count, eq, inArray } from "drizzle-orm";
import { OPEN_CREDIT_STATUSES } from "@/lib/credit-line-utils";
import {
  creditRequests,
  db,
  emailThreads,
  invoices,
  processingJobs,
} from "@/lib/db";
import { invoiceInVisibleTrash, invoiceNotDeleted } from "@/lib/invoice-trash";

export type NavCounts = {
  invoices: number;
  inbox: number;
  trash: number;
  credits: number;
  /** Jobs still needing attention: pending, in flight, or failed. */
  processing: number;
};

export async function getNavCounts(organizationId: string): Promise<NavCounts> {
  const orgFilter = eq(invoices.organizationId, organizationId);

  const [invoiceRow, inboxRow, trashRow, creditsRow, processingRow] = await Promise.all([
    db
      .select({ value: count() })
      .from(invoices)
      .where(and(orgFilter, invoiceNotDeleted())),
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

  return {
    invoices: invoiceRow[0]?.value ?? 0,
    inbox: inboxRow[0]?.value ?? 0,
    trash: trashRow[0]?.value ?? 0,
    credits: creditsRow[0]?.value ?? 0,
    processing: processingRow[0]?.value ?? 0,
  };
}
