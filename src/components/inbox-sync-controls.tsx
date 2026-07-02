"use client";

import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { PollResult } from "@/lib/o365/poll";
import type { SyncProgressEvent } from "@/lib/o365/sync-events";

type InboxSyncControlsProps = {
  canSync: boolean;
  lastSyncedAt: string | null;
};

function formatLastSynced(value: string | null) {
  if (!value) return "Never synced";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function parseSyncEvent(line: string): SyncProgressEvent | null {
  if (!line.startsWith("data: ")) return null;
  try {
    return JSON.parse(line.slice(6)) as SyncProgressEvent;
  } catch {
    return null;
  }
}

function completionMessage(result: PollResult) {
  if (result.fatal && result.synced === 0 && result.skipped === 0) {
    return result.errors[0] ?? "Sync failed";
  }

  if (result.synced > 0 || result.skipped > 0) {
    const parts = [`Imported ${result.synced} new`];
    if (result.skipped > 0) {
      parts.push(`${result.skipped} already synced`);
    }
    if (result.invoicesProcessed > 0) {
      parts.push(`${result.invoicesProcessed} invoices processed`);
    }
    const summary = `Sync complete — ${parts.join(", ")}.`;
    if (result.errors.length > 0) {
      return `${summary} ${result.errors.length} message(s) had errors.`;
    }
    return summary;
  }

  return "Sync complete — no new messages found.";
}

export function InboxSyncControls({ canSync, lastSyncedAt }: InboxSyncControlsProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetFeedback = useCallback(() => {
    setStatusMessage(null);
    setSubject(null);
    setProgress(null);
    setError(null);
    setSuccess(null);
  }, []);

  const handleSync = useCallback(async () => {
    if (!canSync || syncing) return;

    resetFeedback();
    setSyncing(true);

    try {
      const response = await fetch("/api/inbox/sync", { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Sync failed to start");
      }
      if (!response.body) {
        throw new Error("Sync stream unavailable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.trim();
          const event = parseSyncEvent(line);
          if (!event) continue;

          if (event.type === "status") {
            setStatusMessage(event.message);
          } else if (event.type === "progress") {
            setStatusMessage(event.message);
            setSubject(event.subject ?? null);
            setProgress({ current: event.current, total: event.total });
          } else if (event.type === "complete") {
            setProgress(
              event.result.synced + event.result.skipped > 0
                ? {
                    current: event.result.synced + event.result.skipped,
                    total: event.result.synced + event.result.skipped,
                  }
                : null,
            );
            setSuccess(completionMessage(event.result));
            if (event.result.errors.length > 0 && event.result.fatal) {
              setError(event.result.errors.join("; "));
            } else if (event.result.errors.length > 0) {
              setError(
                `${event.result.errors.length} message(s) could not be synced. The mailbox connection is still active.`,
              );
            }
            router.refresh();
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [canSync, resetFeedback, router, syncing]);

  const progressValue =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : syncing
        ? undefined
        : 0;

  return (
    <div className="space-y-3 border-b bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">Mailbox sync</p>
          <p className="truncate text-xs text-muted-foreground">
            Last synced: {formatLastSynced(lastSyncedAt)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleSync()}
          disabled={!canSync || syncing}
          className="shrink-0"
        >
          {syncing ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-3.5" />
          )}
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      {syncing || progress ? (
        <div className="space-y-1.5">
          <Progress value={progressValue} />
          {statusMessage ? (
            <p className="text-xs text-muted-foreground">{statusMessage}</p>
          ) : null}
          {subject ? (
            <p className="truncate text-xs text-muted-foreground" title={subject}>
              {subject}
            </p>
          ) : null}
        </div>
      ) : null}

      {success ? (
        <Alert>
          <AlertDescription className="text-xs">{success}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}

      {!canSync ? (
        <p className="text-xs text-muted-foreground">
          Connect Office 365 and select a mailbox in Admin to enable sync.
        </p>
      ) : null}
    </div>
  );
}
