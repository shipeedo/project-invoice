import { and, asc, count, eq, inArray, isNull, lt, lte, notInArray, or } from "drizzle-orm";
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
import { AiRateLimitError } from "@/lib/extraction";
import { emailHasProcessableInvoiceSource } from "@/lib/invoice-portals";
import { processStoredMailboxMessage } from "@/lib/o365/process-email";

export const DEFAULT_PROCESSING_CONCURRENCY = 1;
const MAX_PROCESSING_CONCURRENCY = 10;
const MAX_JOB_ATTEMPTS = 3;
/** A PROCESSING job older than this belongs to a crashed run and is reclaimed. */
const STALE_PROCESSING_MS = 15 * 60 * 1000;

/**
 * Rate-limited jobs get far more patience than ordinary failures: the email
 * is fine, the provider is throttling us. Exponential backoff starting at
 * 2 minutes and capped at 30, giving up after ~2.5 hours of retries.
 */
export const RATE_LIMIT_MAX_ATTEMPTS = 8;
const RATE_LIMIT_BACKOFF_BASE_MS = 2 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MAX_MS = 30 * 60 * 1000;

export function computeRateLimitBackoffMs(attempts: number): number {
  const exponent = Math.max(attempts - 1, 0);
  return Math.min(
    RATE_LIMIT_BACKOFF_BASE_MS * 2 ** exponent,
    RATE_LIMIT_BACKOFF_MAX_MS,
  );
}

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
 * Atomically claims the oldest claimable job not yet attempted in this run.
 * Failed attempts go back to PENDING but are excluded via attemptedIds so a
 * job is tried at most once per run — retries wait for the next run instead
 * of hammering a rate-limited provider in a tight loop. RATE_LIMITED jobs
 * only become claimable once their backoff (nextAttemptAt) has elapsed.
 */
function claimNextJob(attemptedIds: Set<string>): ProcessingJob | null {
  return db.transaction((tx) => {
    const claimable = and(
      inArray(processingJobs.status, ["PENDING", "RATE_LIMITED"]),
      or(
        isNull(processingJobs.nextAttemptAt),
        lte(processingJobs.nextAttemptAt, new Date()),
      ),
    );
    const pending = tx
      .select()
      .from(processingJobs)
      .where(
        attemptedIds.size > 0
          ? and(claimable, notInArray(processingJobs.id, [...attemptedIds]))
          : claimable,
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
        nextAttemptAt: null,
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
    nextAttemptAt?: Date | null;
    aiModel?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    costUsd?: number | null;
  },
) {
  const stillQueued = fields.status === "PENDING" || fields.status === "RATE_LIMITED";
  await db
    .update(processingJobs)
    .set({
      status: fields.status,
      outcome: fields.outcome ?? null,
      invoiceId: fields.invoiceId ?? null,
      lastError: fields.lastError ?? null,
      nextAttemptAt: fields.nextAttemptAt ?? null,
      aiModel: fields.aiModel ?? null,
      promptTokens: fields.promptTokens ?? null,
      completionTokens: fields.completionTokens ?? null,
      costUsd: fields.costUsd ?? null,
      finishedAt: stillQueued ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId));
}

type ProcessJobResult = "completed" | "failed" | "rate_limited";

async function processJob(job: ProcessingJob): Promise<ProcessJobResult> {
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
        return "completed";
      }
      await finalizeJob(job.id, { status: "FAILED", lastError: result.error });
      return "failed";
    }

    if (result.outcome.skipped) {
      await finalizeJob(job.id, {
        status: "COMPLETED",
        outcome: result.outcome.reason ?? "ignored",
      });
      return "completed";
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
    return "completed";
  } catch (error) {
    if (error instanceof AiRateLimitError) {
      const exhausted = job.attempts >= RATE_LIMIT_MAX_ATTEMPTS;
      await finalizeJob(job.id, {
        status: exhausted ? "FAILED" : "RATE_LIMITED",
        lastError: error.message,
        nextAttemptAt: exhausted
          ? null
          : new Date(Date.now() + computeRateLimitBackoffMs(job.attempts)),
      });
      return exhausted ? "failed" : "rate_limited";
    }

    const message = error instanceof Error ? error.message : "Processing failed";
    await finalizeJob(job.id, {
      status: job.attempts >= MAX_JOB_ATTEMPTS ? "FAILED" : "PENDING",
      lastError: message,
    });
    return "failed";
  }
}

export type ProcessingQueueRun = {
  started: boolean;
  processed: number;
  failed: number;
  rateLimited: number;
};

/**
 * Drains the queue with at most the configured number of jobs in flight.
 * Safe to call from anywhere — overlapping calls return immediately.
 */
export async function runProcessingQueue(): Promise<ProcessingQueueRun> {
  if (queueRunning) {
    return { started: false, processed: 0, failed: 0, rateLimited: 0 };
  }

  queueRunning = true;
  const stats = { started: true, processed: 0, failed: 0, rateLimited: 0 };

  try {
    recoverStaleJobs();

    const concurrency = resolveProcessingConcurrency();
    const attemptedIds = new Set<string>();
    const touchedOrgIds = new Set<string>();
    // Every job in a run talks to the same provider, so the first rate limit
    // ends the drain — remaining jobs wait for the next run rather than each
    // burning an attempt on a provider that is already throttling us.
    let providerRateLimited = false;

    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (!providerRateLimited) {
          const job = claimNextJob(attemptedIds);
          if (!job) break;
          attemptedIds.add(job.id);
          touchedOrgIds.add(job.organizationId);
          const result = await processJob(job);
          if (result === "completed") {
            stats.processed += 1;
          } else if (result === "rate_limited") {
            stats.rateLimited += 1;
            providerRateLimited = true;
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
  if (job.status !== "FAILED" && job.status !== "RATE_LIMITED") {
    return { error: "Only failed or rate-limited jobs can be retried" as const };
  }

  await db
    .update(processingJobs)
    .set({
      status: "PENDING",
      attempts: 0,
      outcome: null,
      nextAttemptAt: null,
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
    RATE_LIMITED: 0,
    COMPLETED: 0,
    FAILED: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.value;
  }
  return counts;
}
