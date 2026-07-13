import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  ProcessingQueueView,
  type ProcessingQueueJob,
} from "@/components/processing-queue-view";
import { db, processingJobs } from "@/lib/db";
import { getNavCounts } from "@/lib/nav-counts";
import { getProcessingQueueCounts } from "@/lib/processing-queue";
import { requireSession } from "@/lib/session";

const MAX_LISTED_JOBS = 100;

export default async function ProcessingQueuePage() {
  const session = await requireSession();

  if (session.user.role !== "ADMIN") {
    redirect("/queue");
  }

  const [rows, counts, navCounts] = await Promise.all([
    db.query.processingJobs.findMany({
      where: eq(processingJobs.organizationId, session.user.organizationId),
      with: {
        message: { columns: { subject: true, fromEmail: true } },
      },
      orderBy: desc(processingJobs.createdAt),
      limit: MAX_LISTED_JOBS,
    }),
    getProcessingQueueCounts(session.user.organizationId),
    getNavCounts(session.user.organizationId, session.user.id),
  ]);

  const jobs: ProcessingQueueJob[] = rows.map((row) => ({
    id: row.id,
    status: row.status,
    attempts: row.attempts,
    outcome: row.outcome,
    lastError: row.lastError,
    invoiceId: row.invoiceId,
    subject: row.message?.subject ?? null,
    fromEmail: row.message?.fromEmail ?? null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
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
            so a burst of arrivals never overwhelms the AI service. Showing the
            latest {MAX_LISTED_JOBS} jobs.
          </p>
        </div>

        <ProcessingQueueView jobs={jobs} counts={counts} />
      </div>
    </AppShell>
  );
}
