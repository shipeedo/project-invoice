"use client";

import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { PollResult } from "@/lib/o365/poll";
import type { SyncProgressEvent } from "@/lib/o365/sync-events";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SyncLogEntry = {
  id: string;
  message: string;
  subject?: string;
  timestamp: number;
};

type InboxSyncContextValue = {
  canSync: boolean;
  syncing: boolean;
  statusMessage: string | null;
  subject: string | null;
  progress: { current: number; total: number } | null;
  logEntries: SyncLogEntry[];
  logDialogOpen: boolean;
  setLogDialogOpen: (open: boolean) => void;
  handleSyncClick: () => void;
};

const InboxSyncContext = createContext<InboxSyncContextValue | null>(null);

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

type InboxSyncProviderProps = {
  canSync: boolean;
  children: ReactNode;
};

export function InboxSyncProvider({ canSync, children }: InboxSyncProviderProps) {
  const router = useRouter();
  const logIdRef = useRef(0);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [logEntries, setLogEntries] = useState<SyncLogEntry[]>([]);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [completionNote, setCompletionNote] = useState<string | null>(null);

  const appendLog = useCallback((message: string, entrySubject?: string) => {
    logIdRef.current += 1;
    setLogEntries((current) => [
      ...current,
      {
        id: String(logIdRef.current),
        message,
        subject: entrySubject,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const resetSyncState = useCallback(() => {
    setStatusMessage(null);
    setSubject(null);
    setProgress(null);
    setLogEntries([]);
    setCompletionNote(null);
    logIdRef.current = 0;
  }, []);

  const startSync = useCallback(async () => {
    if (!canSync || syncing) return;

    resetSyncState();
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
            appendLog(event.message);
          } else if (event.type === "progress") {
            setStatusMessage(event.message);
            setSubject(event.subject ?? null);
            setProgress({ current: event.current, total: event.total });
            appendLog(event.message, event.subject);
          } else if (event.type === "complete") {
            setProgress(
              event.result.synced + event.result.skipped > 0
                ? {
                    current: event.result.synced + event.result.skipped,
                    total: event.result.synced + event.result.skipped,
                  }
                : null,
            );
            const summary = completionMessage(event.result);
            setCompletionNote(summary);
            appendLog(summary);
            router.refresh();
          } else if (event.type === "error") {
            setCompletionNote(event.message);
            appendLog(event.message);
          }
        }
      }
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Sync failed";
      setCompletionNote(message);
      appendLog(message);
    } finally {
      setSyncing(false);
    }
  }, [appendLog, canSync, resetSyncState, router, syncing]);

  const handleSyncClick = useCallback(() => {
    if (syncing) {
      setLogDialogOpen(true);
      return;
    }
    void startSync();
  }, [startSync, syncing]);

  useEffect(() => {
    if (!syncing && completionNote) {
      const timer = window.setTimeout(() => setCompletionNote(null), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [syncing, completionNote]);

  const value = useMemo(
    () => ({
      canSync,
      syncing,
      statusMessage,
      subject,
      progress,
      logEntries,
      logDialogOpen,
      setLogDialogOpen,
      handleSyncClick,
    }),
    [
      canSync,
      syncing,
      statusMessage,
      subject,
      progress,
      logEntries,
      logDialogOpen,
      handleSyncClick,
    ],
  );

  const progressValue =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : syncing
        ? undefined
        : 0;

  const showProgressBar = syncing || Boolean(completionNote);

  return (
    <InboxSyncContext.Provider value={value}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {showProgressBar ? (
          <div className="sticky top-0 z-20 shrink-0 border-b bg-background/95 px-4 py-2 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <Progress value={progressValue} className="h-1.5" />
                <div className="flex min-w-0 items-baseline gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0 font-medium text-foreground">
                    {syncing ? statusMessage ?? "Syncing…" : completionNote}
                  </span>
                  {syncing && subject ? (
                    <span className="truncate" title={subject}>
                      {subject}
                    </span>
                  ) : null}
                </div>
              </div>
              {syncing ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={() => setLogDialogOpen(true)}
                >
                  View log
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
      <InboxSyncLogDialog />
    </InboxSyncContext.Provider>
  );
}

export function useInboxSync() {
  const context = useContext(InboxSyncContext);
  if (!context) {
    throw new Error("useInboxSync must be used within InboxSyncProvider");
  }
  return context;
}

export function InboxSyncButton({ className }: { className?: string }) {
  const context = useContext(InboxSyncContext);
  if (!context) return null;

  const { canSync, syncing, handleSyncClick } = context;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleSyncClick}
      disabled={!canSync}
      className={cn("shrink-0", className)}
      title={syncing ? "View sync log" : "Sync mailbox now"}
    >
      {syncing ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <RefreshCwIcon className="size-3.5" />
      )}
      <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync now"}</span>
    </Button>
  );
}

function InboxSyncLogDialog() {
  const { syncing, logEntries, logDialogOpen, setLogDialogOpen, statusMessage, progress } =
    useInboxSync();

  return (
    <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
      <DialogContent className="flex max-h-[min(80vh,560px)] flex-col gap-0 overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{syncing ? "Sync in progress" : "Sync log"}</DialogTitle>
          <DialogDescription>
            {syncing && progress
              ? `${statusMessage ?? "Syncing"} (${progress.current}/${progress.total})`
              : "Messages downloaded during the latest sync."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto border-t py-2">
          {logEntries.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted-foreground">No log entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {logEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-md border bg-muted/20 px-3 py-2 text-sm"
                >
                  <p className="font-medium">{entry.message}</p>
                  {entry.subject ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {entry.subject}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
