import { and, asc, count, eq, isNull, lt, notInArray } from "drizzle-orm";
import { countInvoiceLikeAttachments } from "@/lib/attachment-types";
import {
  db,
  mailboxMessages,
  processedO365Messages,
  processingJobs,
  type ProcessingJob,
} from "@/lib/db";
import type { ProcessingJobStatus } from "@/lib/db/types";
import { getAiCallCostUsd, refreshAiCredits } from "@/lib/ai-connector";
import { emailHasProcessableInvoiceSource } from "@/lib/invoice-portals";
import { processStoredMailboxMessage } from "@/lib/o365/process-email";

export const DEFAULT_PROCESSING_CONCURRENCY = 1;
const MAX_PROCESSING_CONCURRENCY = 10;
const MAX_JOB_ATTEMPTS = 3;
/** A PROCESSING job older than this belongs to a crashed run and is reclaimed. */
const STALE_PROCESSING_MS = 15 * 60 * 1000;

/**
 * How many jobs may run in parallel. Kept at 1 by default so a burst of
 * inbound email never fans out into parallel LLM calls and rate limits.
 */
export function resolveProcessingConcurrency(
  raw: string | undefined = process.env.INVOICE_PROCESSING_CONCURRENCY,
): number {
  const parsed = Number.parseInt(raw?.trim() ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PROCESSING_CONCURRENCY;
  return Math.min(parsed, MAX_PROCESSING_CONCURRENCY);
}

/**
 * Creates a job for every synced inbound message that still needs invoice
 * processing. Cheap and idempotent: no LLM calls happen here, and a message
 * only ever gets one job row (retries reuse it).
 */
export async function enqueuePendingInboundMessages(organizationId: string) {
  const pendingMessages = await db.query.mailboxMessages.findMany({
    where: and(
      eq(mailboxMessages.organizationId, organizationId),
      eq(mailboxMessages.direction, "INBOUND"),
      isNull(mailboxMessages.invoiceId),
    ),
    with: { attachments: true },
  });

  let enqueued = 0;

  for (const message of pendingMessages) {
    const existingJob = await db.query.processingJobs.findFirst({
      where: eq(processingJobs.mailboxMessageId, message.id),
      columns: { id: true },
    });
    if (existingJob) continue;

    const alreadyProcessed = await db.query.processedO365Messages.findFirst({
      where: and(
        eq(processedO365Messages.organizationId, organizationId),
        eq(processedO365Messages.messageId, message.graphMessageId),
      ),
      columns: { id: true },
    });
    if (alreadyProcessed) continue;

    const fileAttachments = message.attachments.filter(
      (attachment) => !attachment.isInline,
    );

    if (
      !emailHasProcessableInvoiceSource({
        attachmentCount: countInvoiceLikeAttachments(fileAttachments),
        attachmentFileNames: fileAttachments.map((attachment) => attachment.fileName),
        subject: message.subject,
        bodyHtml: message.bodyHtml,
        bodyText: message.bodyText,
      })
    ) {
      continue;
    }

    await db
      .insert(processingJobs)
      .values({ organizationId, mailboxMessageId: message.id })
      .onConflictDoNothing();
    enqueued += 1;
  }

  return enqueued;
}

let queueRunning = false;

export function isProcessingQueueRunning() {
  return queueRunning;
}

function recoverStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);
  db.update(processingJobs)
    .set({ status: "PENDING", updatedAt: new Date() })
    .where(
      and(
        eq(processingJobs.status, "PROCESSING"),
        lt(processingJobs.startedAt, cutoff),
      ),
    )
    .run();
}

/**
 * Atomically claims the oldest pending job not yet attempted in this run.
 * Failed attempts go back to PENDING but are excluded via attemptedIds so a
 * job is tried at most once per run — retries wait for the next run instead
 * of hammering a rate-limited provider in a tight loop.
 */
function claimNextJob(attemptedIds: Set<string>): ProcessingJob | null {
  return db.transaction((tx) => {
    const pending = tx
      .select()
      .from(processingJobs)
      .where(
        attemptedIds.size > 0
          ? and(
              eq(processingJobs.status, "PENDING"),
              notInArray(processingJobs.id, [...attemptedIds]),
            )
          : eq(processingJobs.status, "PENDING"),
      )
      .orderBy(asc(processingJobs.createdAt))
      .limit(1)
      .get();

    if (!pending) return null;

    return tx
      .update(processingJobs)
      .set({
        status: "PROCESSING",
        attempts: pending.attempts + 1,
        startedAt: new Date(),
        finishedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, pending.id))
      .returning()
      .get();
  });
}

async function finalizeJob(
  jobId: string,
  fields: {
    status: ProcessingJobStatus;
    outcome?: string | null;
    invoiceId?: string | null;
    lastError?: string | null;
    aiModel?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    costUsd?: number | null;
  },
) {
  await db
    .update(processingJobs)
    .set({
      status: fields.status,
      outcome: fields.outcome ?? null,
      invoiceId: fields.invoiceId ?? null,
      lastError: fields.lastError ?? null,
      aiModel: fields.aiModel ?? null,
      promptTokens: fields.promptTokens ?? null,
      completionTokens: fields.completionTokens ?? null,
      costUsd: fields.costUsd ?? null,
      finishedAt: fields.status === "PENDING" ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId));
}

async function processJob(job: ProcessingJob): Promise<boolean> {
  try {
    const result = await processStoredMailboxMessage({
      organizationId: job.organizationId,
      messageId: job.mailboxMessageId,
      triggeredBy: "queue",
    });

    if ("error" in result) {
      if ("invoiceId" in result && result.invoiceId) {
        await finalizeJob(job.id, {
          status: "COMPLETED",
          outcome: "already_processed",
          invoiceId: result.invoiceId,
        });
        return true;
      }
      await finalizeJob(job.id, { status: "FAILED", lastError: result.error });
      return false;
    }

    if (result.outcome.skipped) {
      await finalizeJob(job.id, {
        status: "COMPLETED",
        outcome: result.outcome.reason ?? "ignored",
      });
      return true;
    }

    const usage = result.outcome.usage;
    const costUsd = await getAiCallCostUsd(job.organizationId, usage);
    await finalizeJob(job.id, {
      status: "COMPLETED",
      outcome: "invoice_created",
      invoiceId: result.outcome.invoice.id,
      aiModel: result.outcome.model ?? null,
      promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null,
      costUsd,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    await finalizeJob(job.id, {
      status: job.attempts >= MAX_JOB_ATTEMPTS ? "FAILED" : "PENDING",
      lastError: message,
    });
    return false;
  }
}

export type ProcessingQueueRun = {
  started: boolean;
  processed: number;
  failed: number;
};

/**
 * Drains the queue with at most the configured number of jobs in flight.
 * Safe to call from anywhere — overlapping calls return immediately.
 */
export async function runProcessingQueue(): Promise<ProcessingQueueRun> {
  if (queueRunning) {
    return { started: false, processed: 0, failed: 0 };
  }

  queueRunning = true;
  const stats = { started: true, processed: 0, failed: 0 };

  try {
    recoverStaleJobs();

    const concurrency = resolveProcessingConcurrency();
    const attemptedIds = new Set<string>();
    const touchedOrgIds = new Set<string>();

    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (true) {
          const job = claimNextJob(attemptedIds);
          if (!job) break;
          attemptedIds.add(job.id);
          touchedOrgIds.add(job.organizationId);
          const succeeded = await processJob(job);
          if (succeeded) {
            stats.processed += 1;
          } else {
            stats.failed += 1;
          }
        }
      }),
    );

    // Keep the cached gateway balance (used by the sidebar warning) reasonably
    // fresh without paying for a network call on every page render.
    for (const orgId of touchedOrgIds) {
      await refreshAiCredits(orgId);
    }

    return stats;
  } finally {
    queueRunning = false;
  }
}

/** Fire-and-forget queue drain, used after syncs enqueue new jobs. */
export function kickProcessingQueue() {
  void runProcessingQueue().catch((error) => {
    console.error("[processing-queue] Run failed:", error);
  });
}

export async function retryProcessingJob(params: {
  organizationId: string;
  jobId: string;
}) {
  const job = await db.query.processingJobs.findFirst({
    where: and(
      eq(processingJobs.id, params.jobId),
      eq(processingJobs.organizationId, params.organizationId),
    ),
  });

  if (!job) return { error: "Job not found" as const };
  if (job.status !== "FAILED") {
    return { error: "Only failed jobs can be retried" as const };
  }

  await db
    .update(processingJobs)
    .set({
      status: "PENDING",
      attempts: 0,
      outcome: null,
      startedAt: null,
      finishedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, job.id));

  kickProcessingQueue();
  return { retried: true as const };
}

export type ProcessingQueueCounts = Record<ProcessingJobStatus, number>;

export async function getProcessingQueueCounts(
  organizationId: string,
): Promise<ProcessingQueueCounts> {
  const rows = await db
    .select({ status: processingJobs.status, value: count() })
    .from(processingJobs)
    .where(eq(processingJobs.organizationId, organizationId))
    .groupBy(processingJobs.status);

  const counts: ProcessingQueueCounts = {
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.value;
  }
  return counts;
}
