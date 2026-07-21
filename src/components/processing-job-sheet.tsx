"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileTextIcon,
  MessagesSquareIcon,
  PaperclipIcon,
  RotateCcwIcon,
  WandSparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmailMessageBody } from "@/components/email-message-body";
import type { ProcessingJobStatus } from "@/lib/db/types";
import { statusLabel } from "@/lib/format";
import {
  isDisplayAttachment,
  prepareEmailHtmlForDisplay,
} from "@/lib/email-body";

type JobDetails = {
  job: {
    id: string;
    status: ProcessingJobStatus;
    outcome: string | null;
    lastError: string | null;
    attempts: number;
    invoiceId: string | null;
    createdAt: string;
    finishedAt: string | null;
  };
  email: {
    subject: string | null;
    fromName: string | null;
    fromEmail: string | null;
    toEmails: string[];
    ccEmails: string[];
    receivedAt: string | null;
    bodyHtml: string | null;
    bodyText: string | null;
    threadId: string | null;
    attachments: Array<{
      id: string;
      fileName: string;
      isInline: boolean | null;
      contentId: string | null;
    }>;
  };
};

type ProcessingJobSheetProps = {
  jobId: string | null;
  onOpenChange: (open: boolean) => void;
};

function formatReceivedAt(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type LoadedJob = {
  forJobId: string;
  details: JobDetails | null;
  error: string | null;
};

export function ProcessingJobSheet({ jobId, onOpenChange }: ProcessingJobSheetProps) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<LoadedJob | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/processing-queue/jobs/${jobId}`);
      if (cancelled) return;
      if (!response.ok) {
        setLoaded({ forJobId: jobId, details: null, error: "Failed to load job details" });
        return;
      }
      setLoaded({
        forJobId: jobId,
        details: (await response.json()) as JobDetails,
        error: null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Data from a previously opened job is stale; render the loading state
  // until the fetch for the current job lands.
  const details = loaded?.forJobId === jobId ? loaded.details : null;
  const loadError = loaded?.forJobId === jobId ? loaded.error : null;

  const renderedHtml = useMemo(() => {
    if (!details?.email.bodyHtml) return null;
    return prepareEmailHtmlForDisplay(
      details.email.bodyHtml,
      details.email.attachments,
    );
  }, [details]);

  async function processAsInvoice() {
    if (!jobId) return;
    setBusy(true);
    setActionError(null);
    const response = await fetch(`/api/processing-queue/jobs/${jobId}/process`, {
      method: "POST",
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string; invoiceId?: string; skipped?: boolean; message?: string }
      | null;
    setBusy(false);

    if (!response.ok) {
      setActionError(body?.error ?? "Failed to process as invoice");
      router.refresh();
      return;
    }

    router.refresh();
    if (body?.invoiceId) {
      // Covers the duplicate skip too: it reports success and links the
      // invoice this one duplicates, so the user lands on it rather than
      // reading an error and having to search for it.
      router.push(`/invoices/${body.invoiceId}`);
    }
  }

  async function retry() {
    if (!jobId) return;
    setBusy(true);
    setActionError(null);
    const response = await fetch(`/api/processing-queue/jobs/${jobId}/retry`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setActionError(body?.error ?? "Failed to retry job");
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  const email = details?.email;
  const job = details?.job;
  const senderLabel = email
    ? email.fromName
      ? `${email.fromName} <${email.fromEmail ?? ""}>`
      : (email.fromEmail ?? "—")
    : "—";
  const displayAttachments = email?.attachments.filter(isDisplayAttachment) ?? [];
  const canProcessAsInvoice = Boolean(job && !job.invoiceId && job.status !== "PROCESSING");

  return (
    <Sheet
      open={jobId !== null}
      onOpenChange={(open) => {
        if (!open) setActionError(null);
        onOpenChange(open);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="truncate">
            {email?.subject ?? "Queued email"}
          </SheetTitle>
          <SheetDescription>
            {job
              ? `${statusLabel(job.status)}${job.outcome ? ` — ${job.outcome.replaceAll("_", " ")}` : ""} · ${job.attempts} attempt${job.attempts === 1 ? "" : "s"}`
              : "Original email for this processing job"}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadError ? (
            <p className="px-4 py-6 text-sm text-destructive">{loadError}</p>
          ) : !details ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="space-y-3 border-b px-4 py-3 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">From</dt>
                  <dd className="min-w-0 break-words font-medium">{senderLabel}</dd>
                  <dt className="text-muted-foreground">To</dt>
                  <dd className="min-w-0 break-words">
                    {details.email.toEmails.length > 0
                      ? details.email.toEmails.join(", ")
                      : "—"}
                  </dd>
                  {details.email.ccEmails.length > 0 ? (
                    <>
                      <dt className="text-muted-foreground">Cc</dt>
                      <dd className="min-w-0 break-words">
                        {details.email.ccEmails.join(", ")}
                      </dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">Received</dt>
                  <dd>{formatReceivedAt(details.email.receivedAt)}</dd>
                </dl>

                {displayAttachments.length > 0 ? (
                  <ul className="flex flex-wrap items-center gap-1">
                    {displayAttachments.map((attachment) => (
                      <li key={attachment.id}>
                        <a
                          href={`/api/inbox/attachments/${attachment.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-56 items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-xs transition-colors hover:bg-muted/60"
                          title={attachment.fileName}
                        >
                          <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{attachment.fileName}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {details.email.threadId ? (
                  <Link
                    href={`/inbox/${details.email.threadId}`}
                    className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-2"
                  >
                    <MessagesSquareIcon className="size-3.5" />
                    Open conversation in inbox
                  </Link>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {job?.invoiceId ? (
                    <Link
                      href={`/invoices/${job.invoiceId}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2"
                    >
                      <FileTextIcon className="size-4" />
                      View created invoice
                    </Link>
                  ) : null}
                  {canProcessAsInvoice ? (
                    <Button
                      size="sm"
                      onClick={() => void processAsInvoice()}
                      disabled={busy}
                    >
                      <WandSparklesIcon data-icon="inline-start" />
                      {busy ? "Processing…" : "Process as invoice"}
                    </Button>
                  ) : null}
                  {job?.status === "FAILED" || job?.status === "RATE_LIMITED" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void retry()}
                      disabled={busy}
                    >
                      <RotateCcwIcon data-icon="inline-start" />
                      {job.status === "RATE_LIMITED" ? "Retry now" : "Retry through queue"}
                    </Button>
                  ) : null}
                </div>
                {canProcessAsInvoice ? (
                  <p className="text-xs text-muted-foreground">
                    Process as invoice overrides the classifier and statement
                    checks and imports this email as an invoice immediately.
                  </p>
                ) : null}
                {job?.lastError ? (
                  <p className="text-xs text-destructive">{job.lastError}</p>
                ) : null}
                {actionError ? (
                  <p className="text-xs text-destructive">{actionError}</p>
                ) : null}
              </div>

              <div className="bg-white px-4 py-4 text-sm leading-relaxed text-foreground">
                {renderedHtml ? (
                  <EmailMessageBody html={renderedHtml} />
                ) : details.email.bodyText ? (
                  <p className="whitespace-pre-wrap break-words">
                    {details.email.bodyText}
                  </p>
                ) : (
                  <p className="text-muted-foreground">No message body available.</p>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
