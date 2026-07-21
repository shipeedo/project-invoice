import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, processedO365Messages, processingJobs } from "@/lib/db";
import { DUPLICATE_SKIP_MESSAGE } from "@/lib/o365/invoice-duplicates";
import { processStoredMailboxMessage } from "@/lib/o365/process-email";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Manual override: process this job's email as an invoice regardless of what
 * the classifier or heuristics decided. Clears the processed-message ledger
 * entry (which records the earlier ignore) so the pipeline can run again,
 * then processes with the manual trigger, which skips the automated gates.
 */
export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await db.query.processingJobs.findFirst({
    where: and(
      eq(processingJobs.id, id),
      eq(processingJobs.organizationId, session.user.organizationId),
    ),
    with: { message: { columns: { id: true, graphMessageId: true, invoiceId: true } } },
  });

  if (!job || !job.message) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.message.invoiceId) {
    return NextResponse.json(
      {
        error: "An invoice has already been created from this email",
        invoiceId: job.message.invoiceId,
      },
      { status: 409 },
    );
  }

  await db
    .delete(processedO365Messages)
    .where(
      and(
        eq(processedO365Messages.organizationId, session.user.organizationId),
        eq(processedO365Messages.messageId, job.message.graphMessageId),
      ),
    );

  await db
    .update(processingJobs)
    .set({
      status: "PROCESSING",
      attempts: job.attempts + 1,
      startedAt: new Date(),
      finishedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, job.id));

  const result = await processStoredMailboxMessage({
    organizationId: session.user.organizationId,
    messageId: job.mailboxMessageId,
    triggeredBy: "manual",
  });

  if (result.error || !result.outcome) {
    const message = result.error ?? "Processing failed";
    await db
      .update(processingJobs)
      .set({
        status: "FAILED",
        lastError: message,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, job.id));
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { outcome } = result;

  if (outcome.skipped) {
    const isDuplicate = outcome.reason === "duplicate_invoice";
    const message = isDuplicate
      ? DUPLICATE_SKIP_MESSAGE
      : `Processing was skipped (${outcome.reason.replaceAll("_", " ")})`;

    // A correctly-skipped duplicate is a successful outcome, not a failure, so
    // it records the same way a background queue run would. Other skip reasons
    // still surface as failures for a human to look at.
    await db
      .update(processingJobs)
      .set({
        status: isDuplicate ? "COMPLETED" : "FAILED",
        outcome: isDuplicate ? outcome.reason : null,
        lastError: isDuplicate ? null : message,
        invoiceId: isDuplicate ? (outcome.duplicateInvoiceId ?? null) : null,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, job.id));

    // A duplicate is reported as success so the caller can follow invoiceId
    // through to the invoice it duplicates; returning an error status made the
    // sheet render it as a failure and drop that link.
    if (isDuplicate) {
      return NextResponse.json({
        skipped: true,
        reason: outcome.reason,
        message,
        invoiceId: outcome.duplicateInvoiceId,
      });
    }

    return NextResponse.json({ error: message }, { status: 409 });
  }

  await db
    .update(processingJobs)
    .set({
      status: "COMPLETED",
      outcome: "manually_processed",
      lastError: null,
      invoiceId: outcome.invoice.id,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, job.id));

  return NextResponse.json({ invoiceId: outcome.invoice.id });
}
