import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  emailThreads,
  mailboxMessages,
  organizations,
  processingJobs,
} from "@/lib/db";
import { AiRateLimitError } from "@/lib/extraction";
import {
  computeRateLimitBackoffMs,
  DEFAULT_PROCESSING_CONCURRENCY,
  RATE_LIMIT_MAX_ATTEMPTS,
  resolveProcessingConcurrency,
  runProcessingQueue,
} from "@/lib/processing-queue";
import { processStoredMailboxMessage } from "@/lib/o365/process-email";

vi.mock("@/lib/o365/process-email", () => ({
  processStoredMailboxMessage: vi.fn(),
}));

vi.mock("@/lib/ai-connector", () => ({
  getAiCallCostUsd: vi.fn(async () => null),
  refreshAiCredits: vi.fn(async () => null),
}));

const processMock = vi.mocked(processStoredMailboxMessage);

describe("resolveProcessingConcurrency", () => {
  it("defaults to 1 when unset or blank", () => {
    expect(DEFAULT_PROCESSING_CONCURRENCY).toBe(1);
    expect(resolveProcessingConcurrency(undefined)).toBe(1);
    expect(resolveProcessingConcurrency("")).toBe(1);
    expect(resolveProcessingConcurrency("  ")).toBe(1);
  });

  it("parses a configured value", () => {
    expect(resolveProcessingConcurrency("3")).toBe(3);
    expect(resolveProcessingConcurrency(" 5 ")).toBe(5);
  });

  it("rejects garbage and out-of-range values", () => {
    expect(resolveProcessingConcurrency("zero")).toBe(1);
    expect(resolveProcessingConcurrency("0")).toBe(1);
    expect(resolveProcessingConcurrency("-2")).toBe(1);
    expect(resolveProcessingConcurrency("250")).toBe(10);
  });
});

describe("computeRateLimitBackoffMs", () => {
  it("doubles from 2 minutes and caps at 30", () => {
    expect(computeRateLimitBackoffMs(1)).toBe(2 * 60 * 1000);
    expect(computeRateLimitBackoffMs(2)).toBe(4 * 60 * 1000);
    expect(computeRateLimitBackoffMs(4)).toBe(16 * 60 * 1000);
    expect(computeRateLimitBackoffMs(5)).toBe(30 * 60 * 1000);
    expect(computeRateLimitBackoffMs(20)).toBe(30 * 60 * 1000);
  });

  it("treats missing attempts as the first", () => {
    expect(computeRateLimitBackoffMs(0)).toBe(2 * 60 * 1000);
  });
});

let seedCounter = 0;

async function seedJob(overrides: { attempts?: number } = {}) {
  seedCounter += 1;
  const [org] = await db
    .insert(organizations)
    .values({ name: "Test Org", slug: `org-${seedCounter}-${Date.now()}` })
    .returning();
  const [thread] = await db
    .insert(emailThreads)
    .values({ organizationId: org.id })
    .returning();
  const [message] = await db
    .insert(mailboxMessages)
    .values({
      organizationId: org.id,
      threadId: thread.id,
      graphMessageId: `graph-${seedCounter}`,
      direction: "INBOUND",
    })
    .returning();
  const [job] = await db
    .insert(processingJobs)
    .values({
      organizationId: org.id,
      mailboxMessageId: message.id,
      attempts: overrides.attempts ?? 0,
    })
    .returning();
  return job;
}

async function getJob(id: string) {
  const job = await db.query.processingJobs.findFirst({
    where: eq(processingJobs.id, id),
  });
  if (!job) throw new Error(`job ${id} disappeared`);
  return job;
}

describe("runProcessingQueue rate limiting", () => {
  beforeEach(async () => {
    await db.delete(processingJobs);
    processMock.mockReset();
  });

  it("reschedules a rate-limited job with backoff and stops the drain", async () => {
    const first = await seedJob();
    const second = await seedJob();
    processMock.mockRejectedValue(new AiRateLimitError("AI Gateway error (429)"));

    const stats = await runProcessingQueue();

    expect(stats).toMatchObject({ processed: 0, failed: 0, rateLimited: 1 });

    const limited = await getJob(first.id);
    expect(limited.status).toBe("RATE_LIMITED");
    expect(limited.attempts).toBe(1);
    expect(limited.lastError).toContain("429");
    expect(limited.finishedAt).toBeNull();
    expect(limited.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());

    // The drain stopped at the first 429 — the second job never burned an
    // attempt against a throttled provider.
    const untouched = await getJob(second.id);
    expect(untouched.status).toBe("PENDING");
    expect(untouched.attempts).toBe(0);
    expect(processMock).toHaveBeenCalledTimes(1);
  });

  it("skips rate-limited jobs until their backoff elapses", async () => {
    const limited = await seedJob();
    const pending = await seedJob();
    processMock.mockRejectedValueOnce(new AiRateLimitError("AI Gateway error (429)"));
    await runProcessingQueue();

    // Provider recovered: the pending job processes, the backed-off one waits.
    processMock.mockResolvedValue({
      outcome: { skipped: true as const, reason: "already_processed" as const },
    } as Awaited<ReturnType<typeof processStoredMailboxMessage>>);

    const stats = await runProcessingQueue();
    expect(stats).toMatchObject({ processed: 1, failed: 0, rateLimited: 0 });
    expect((await getJob(pending.id)).status).toBe("COMPLETED");
    expect((await getJob(limited.id)).status).toBe("RATE_LIMITED");

    // Once the backoff elapses the job becomes claimable again.
    await db
      .update(processingJobs)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(processingJobs.id, limited.id));

    const retryStats = await runProcessingQueue();
    expect(retryStats).toMatchObject({ processed: 1 });
    const recovered = await getJob(limited.id);
    expect(recovered.status).toBe("COMPLETED");
    expect(recovered.nextAttemptAt).toBeNull();
  });

  it("fails a job once rate-limit attempts are exhausted", async () => {
    const job = await seedJob({ attempts: RATE_LIMIT_MAX_ATTEMPTS - 1 });
    processMock.mockRejectedValue(new AiRateLimitError("AI Gateway error (429)"));

    const stats = await runProcessingQueue();
    expect(stats).toMatchObject({ processed: 0, failed: 1, rateLimited: 0 });

    const failed = await getJob(job.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.attempts).toBe(RATE_LIMIT_MAX_ATTEMPTS);
    expect(failed.nextAttemptAt).toBeNull();
    expect(failed.finishedAt).not.toBeNull();
  });

  it("keeps ordinary failures on the PENDING retry path", async () => {
    const job = await seedJob();
    processMock.mockRejectedValue(new Error("attachment unreadable"));

    const stats = await runProcessingQueue();
    expect(stats).toMatchObject({ processed: 0, failed: 1, rateLimited: 0 });

    const failed = await getJob(job.id);
    expect(failed.status).toBe("PENDING");
    expect(failed.nextAttemptAt).toBeNull();
    expect(failed.lastError).toBe("attachment unreadable");
  });
});
