"use client";

import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
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
import { formatDate, statusLabel } from "@/lib/format";
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
  nextAttemptAt: string | null;
  aiModel: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
};

type ProcessingQueueViewProps = {
  jobs: ProcessingQueueJob[];
  counts: Record<ProcessingJobStatus, number>;
  page: number;
  pageCount: number;
  pageSize: number;
  /** Jobs matching the current search (all pages), not the org-wide total. */
  totalJobs: number;
  query: string;
};

const SEARCH_DEBOUNCE_MS = 300;

const REFRESH_INTERVAL_MS = 5_000;

const STATUS_STYLES: Record<ProcessingJobStatus, string> = {
  PENDING: "bg-muted text-muted-foreground",
  PROCESSING: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  RATE_LIMITED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  COMPLETED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  FAILED: "bg-destructive/15 text-destructive",
};

function statusBadge(status: ProcessingJobStatus) {
  return (
    <Badge variant="secondary" className={cn("font-medium", STATUS_STYLES[status])}>
      {statusLabel(status)}
    </Badge>
  );
}

function formatCost(job: ProcessingQueueJob) {
  if (job.costUsd != null) {
    return job.costUsd < 0.01
      ? `$${job.costUsd.toFixed(4)}`
      : `$${job.costUsd.toFixed(2)}`;
  }
  // No pricing configured, but the call still recorded usage — show tokens
  // rather than an empty column.
  if (job.promptTokens != null || job.completionTokens != null) {
    const tokens = (job.promptTokens ?? 0) + (job.completionTokens ?? 0);
    return `${tokens.toLocaleString()} tok`;
  }
  return "—";
}

function formatOutcome(job: ProcessingQueueJob) {
  if (job.status === "FAILED") return job.lastError ?? "Failed";
  if (job.status === "RATE_LIMITED") {
    const retryAt = job.nextAttemptAt
      ? ` — retries ${new Date(job.nextAttemptAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : "";
    return `${job.lastError ?? "Provider rate limit"}${retryAt}`;
  }
  if (!job.outcome) return "—";
  return job.outcome.replaceAll("_", " ");
}

export function ProcessingQueueView({
  jobs,
  counts,
  page,
  pageCount,
  pageSize,
  totalJobs,
  query,
}: ProcessingQueueViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [openJobId, setOpenJobId] = useState<string | null>(null);

  const activeCount = counts.PENDING + counts.PROCESSING + counts.RATE_LIMITED;

  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/processing?${qs}` : "/processing";
  };

  // Search runs server-side across all pages; typing updates the URL after a
  // pause and drops back to page 1 of the filtered results.
  useEffect(() => {
    if (search.trim() === query) return;
    const timeout = setTimeout(() => {
      const trimmed = search.trim();
      router.replace(
        trimmed ? `/processing?q=${encodeURIComponent(trimmed)}` : "/processing",
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search, query, router]);

  // Keep the view live while jobs are moving; idle queues refresh slowly so
  // an open tab still notices new arrivals.
  useEffect(() => {
    const interval = setInterval(
      () => router.refresh(),
      activeCount > 0 ? REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS * 6,
    );
    return () => clearInterval(interval);
  }, [router, activeCount]);

  const summaryTiles: Array<{ label: string; value: number }> = [
    { label: "Pending", value: counts.PENDING },
    { label: "Processing", value: counts.PROCESSING },
    { label: "Rate limited", value: counts.RATE_LIMITED },
    { label: "Completed", value: counts.COMPLETED },
    { label: "Failed", value: counts.FAILED },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {summaryTiles.map((tile) => (
          <Card key={tile.label} className="py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">{tile.label}</p>
              <p className="text-2xl font-semibold">{tile.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by subject, sender, status, or outcome"
          className="pl-8"
          aria-label="Search processing jobs"
        />
      </div>

      {jobs.length === 0 ? (
        query ? (
          <p className="text-sm text-muted-foreground">
            No jobs match &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No processing jobs yet. Jobs appear here when synced emails are
            queued for invoice extraction.
          </p>
        )
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Queued</TableHead>
                <TableHead>Finished</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
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
                          job.status === "RATE_LIMITED" &&
                            "text-amber-700 dark:text-amber-300",
                        )}
                        title={job.lastError ?? undefined}
                      >
                        {formatOutcome(job)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{job.attempts}</TableCell>
                  <TableCell
                    className="tabular-nums"
                    title={
                      job.promptTokens != null
                        ? `${job.aiModel ?? "model"} · ${job.promptTokens}+${job.completionTokens ?? 0} tokens`
                        : undefined
                    }
                  >
                    {formatCost(job)}
                  </TableCell>
                  <TableCell>{formatDate(job.createdAt)}</TableCell>
                  <TableCell>{job.finishedAt ? formatDate(job.finishedAt) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalJobs > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, totalJobs)} of{" "}
            {totalJobs.toLocaleString()} {query ? "matching jobs" : "jobs"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => router.push(pageHref(page - 1))}
            >
              <ChevronLeftIcon className="size-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => router.push(pageHref(page + 1))}
            >
              Next
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
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
