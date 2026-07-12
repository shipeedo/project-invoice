"use client";

import { PlayIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProcessingJobSheet } from "@/components/processing-job-sheet";
import type { ProcessingJobStatus } from "@/lib/db/types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ProcessingQueueJob = {
  id: string;
  status: ProcessingJobStatus;
  attempts: number;
  outcome: string | null;
  lastError: string | null;
  invoiceId: string | null;
  subject: string | null;
  fromEmail: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type ProcessingQueueViewProps = {
  jobs: ProcessingQueueJob[];
  counts: Record<ProcessingJobStatus, number>;
  concurrency: number;
};

const REFRESH_INTERVAL_MS = 5_000;

const STATUS_STYLES: Record<ProcessingJobStatus, string> = {
  PENDING: "bg-muted text-muted-foreground",
  PROCESSING: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  COMPLETED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  FAILED: "bg-destructive/15 text-destructive",
};

function statusBadge(status: ProcessingJobStatus) {
  return (
    <Badge variant="secondary" className={cn("font-medium", STATUS_STYLES[status])}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

function formatOutcome(job: ProcessingQueueJob) {
  if (job.status === "FAILED") return job.lastError ?? "Failed";
  if (!job.outcome) return "—";
  return job.outcome.replaceAll("_", " ");
}

export function ProcessingQueueView({
  jobs,
  counts,
  concurrency,
}: ProcessingQueueViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openJobId, setOpenJobId] = useState<string | null>(null);

  const activeCount = counts.PENDING + counts.PROCESSING;

  const visibleJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return jobs;
    return jobs.filter((job) =>
      [
        job.subject,
        job.fromEmail,
        job.status,
        job.outcome?.replaceAll("_", " "),
        job.lastError,
      ].some((field) => field?.toLowerCase().includes(normalized)),
    );
  }, [jobs, query]);

  // Keep the view live while jobs are moving; idle queues refresh slowly so
  // an open tab still notices new arrivals.
  useEffect(() => {
    const interval = setInterval(
      () => router.refresh(),
      activeCount > 0 ? REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS * 6,
    );
    return () => clearInterval(interval);
  }, [router, activeCount]);

  async function processNow() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/processing-queue/run", { method: "POST" });
    setBusy(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to start queue run");
      return;
    }
    router.refresh();
  }

  async function retryJob(jobId: string) {
    setError(null);
    const response = await fetch(`/api/processing-queue/jobs/${jobId}/retry`, {
      method: "POST",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to retry job");
      return;
    }
    router.refresh();
  }

  const summaryTiles: Array<{ label: string; value: number }> = [
    { label: "Pending", value: counts.PENDING },
    { label: "Processing", value: counts.PROCESSING },
    { label: "Completed", value: counts.COMPLETED },
    { label: "Failed", value: counts.FAILED },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summaryTiles.map((tile) => (
            <Card key={tile.label} className="py-3">
              <CardContent className="px-4">
                <p className="text-xs text-muted-foreground">{tile.label}</p>
                <p className="text-2xl font-semibold">{tile.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button onClick={() => void processNow()} disabled={busy || activeCount === 0}>
            <PlayIcon data-icon="inline-start" />
            {busy ? "Processing…" : "Process now"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Concurrency: {concurrency} job{concurrency === 1 ? "" : "s"} at a time
          </p>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by subject, sender, status, or outcome"
          className="pl-8"
          aria-label="Search processing jobs"
        />
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No processing jobs yet. Jobs appear here when synced emails are queued
          for invoice extraction.
        </p>
      ) : visibleJobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No jobs match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Queued</TableHead>
                <TableHead>Finished</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleJobs.map((job) => (
                <TableRow
                  key={job.id}
                  className="cursor-pointer"
                  onClick={() => setOpenJobId(job.id)}
                >
                  <TableCell className="max-w-md">
                    <p className="truncate font-medium">{job.subject ?? "(no subject)"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.fromEmail ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell>{statusBadge(job.status)}</TableCell>
                  <TableCell className="max-w-xs">
                    {job.invoiceId ? (
                      <a
                        href={`/invoices/${job.invoiceId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {formatOutcome(job)}
                      </a>
                    ) : (
                      <span
                        className={cn(
                          "block truncate text-sm",
                          job.status === "FAILED" && "text-destructive",
                        )}
                        title={job.lastError ?? undefined}
                      >
                        {formatOutcome(job)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{job.attempts}</TableCell>
                  <TableCell>{formatDate(job.createdAt)}</TableCell>
                  <TableCell>{job.finishedAt ? formatDate(job.finishedAt) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {job.status === "FAILED" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          void retryJob(job.id);
                        }}
                      >
                        <RotateCcwIcon data-icon="inline-start" />
                        Retry
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProcessingJobSheet
        jobId={openJobId}
        onOpenChange={(open) => {
          if (!open) setOpenJobId(null);
        }}
      />
    </div>
  );
}
