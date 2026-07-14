import {
  and,
  count,
  desc,
  eq,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  ProcessingQueueView,
  type ProcessingQueueJob,
} from "@/components/processing-queue-view";
import { computeAiCallCostUsd, getAiConnector } from "@/lib/ai-connector";
import { db, mailboxMessages, processingJobs } from "@/lib/db";
import { getNavCounts } from "@/lib/nav-counts";
import { getProcessingQueueCounts } from "@/lib/processing-queue";
import { requireSession } from "@/lib/session";

const PAGE_SIZE = 25;

/**
 * Matches the user's search against everything the table shows: email
 * subject/sender, status, outcome (stored snake_case, displayed with spaces),
 * and failure message. LIKE wildcards in the query are escaped so searching
 * for "invoice_created" doesn't turn the underscore into a wildcard.
 */
function buildSearchFilter(query: string): SQL | undefined {
  if (!query) return undefined;
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const matches = (column: AnyColumn | SQL) =>
    sql`${column} LIKE ${pattern} ESCAPE '\\'`;
  return or(
    matches(mailboxMessages.subject),
    matches(mailboxMessages.fromEmail),
    matches(processingJobs.status),
    matches(sql`replace(${processingJobs.outcome}, '_', ' ')`),
    matches(processingJobs.lastError),
  );
}

export default async function ProcessingQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const session = await requireSession();

  if (session.user.role !== "ADMIN") {
    redirect("/queue");
  }

  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const jobFilter = and(
    eq(processingJobs.organizationId, session.user.organizationId),
    buildSearchFilter(query),
  );

  const [[{ totalJobs }], counts, navCounts, connector] = await Promise.all([
    db
      .select({ totalJobs: count() })
      .from(processingJobs)
      .leftJoin(
        mailboxMessages,
        eq(processingJobs.mailboxMessageId, mailboxMessages.id),
      )
      .where(jobFilter),
    getProcessingQueueCounts(session.user.organizationId),
    getNavCounts(session.user.organizationId, session.user.id),
    getAiConnector(session.user.organizationId),
  ]);

  const pageCount = Math.max(1, Math.ceil(totalJobs / PAGE_SIZE));
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), pageCount)
    : 1;

  const rows = await db
    .select({
      job: processingJobs,
      subject: mailboxMessages.subject,
      fromEmail: mailboxMessages.fromEmail,
    })
    .from(processingJobs)
    .leftJoin(
      mailboxMessages,
      eq(processingJobs.mailboxMessageId, mailboxMessages.id),
    )
    .where(jobFilter)
    .orderBy(desc(processingJobs.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  // Jobs processed before pricing was configured have tokens but no stored
  // cost; price them for display with the connector's current per-token rates
  // (never written back to the DB).
  const pricing =
    connector?.modelInputPrice != null && connector?.modelOutputPrice != null
      ? { input: connector.modelInputPrice, output: connector.modelOutputPrice }
      : null;

  const jobs: ProcessingQueueJob[] = rows.map(({ job, subject, fromEmail }) => ({
    id: job.id,
    status: job.status,
    attempts: job.attempts,
    outcome: job.outcome,
    lastError: job.lastError,
    invoiceId: job.invoiceId,
    subject,
    fromEmail,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    nextAttemptAt: job.nextAttemptAt?.toISOString() ?? null,
    aiModel: job.aiModel,
    promptTokens: job.promptTokens,
    completionTokens: job.completionTokens,
    costUsd:
      job.costUsd ??
      (job.promptTokens != null && job.completionTokens != null
        ? computeAiCallCostUsd(pricing, {
            promptTokens: job.promptTokens,
            completionTokens: job.completionTokens,
          })
        : null),
  }));

  return (
    <AppShell
      user={session.user}
      activePath="/processing"
      navCounts={navCounts}
      breadcrumbs={[{ label: "Processing" }]}
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Processing queue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Synced invoice emails wait here and are extracted a few at a time,
            so a burst of arrivals never overwhelms the AI service.
          </p>
        </div>

        <ProcessingQueueView
          jobs={jobs}
          counts={counts}
          page={page}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
          totalJobs={totalJobs}
          query={query}
        />
      </div>
    </AppShell>
  );
}
