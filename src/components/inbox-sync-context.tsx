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
import { createPortal } from "react-dom";
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
    if (result.invoicesQueued > 0) {
      parts.push(`${result.invoicesQueued} queued for invoice processing`);
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
            appendLog(summary);
            router.refresh();
          } else if (event.type === "error") {
            appendLog(event.message);
          }
        }
      }
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Sync failed";
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
      : undefined;

  return (
    <InboxSyncContext.Provider value={value}>
      {typeof document !== "undefined" && syncing
        ? createPortal(
            <div className="fixed inset-x-0 top-0 z-[100]">
              <Progress value={progressValue} className="h-1 rounded-none bg-primary/20" />
            </div>,
            document.body,
          )
        : null}
      {children}
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
  const context = useContext(InboxSyncContext);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logDialogOpen = context?.logDialogOpen ?? false;
  const logEntries = context?.logEntries ?? [];

  useEffect(() => {
    if (logDialogOpen) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logDialogOpen, logEntries.length]);

  if (!context) return null;

  const {
    syncing,
    logDialogOpen: isOpen,
    setLogDialogOpen,
    statusMessage,
    subject,
    progress,
  } = context;

  return (
    <Dialog open={isOpen} onOpenChange={setLogDialogOpen}>
      <DialogContent className="flex max-h-[min(80vh,560px)] flex-col gap-0 overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{syncing ? "Sync in progress" : "Sync log"}</DialogTitle>
          <DialogDescription>
            {syncing
              ? progress
                ? `${statusMessage ?? "Syncing mailbox"} (${progress.current}/${progress.total})`
                : (statusMessage ?? "Syncing mailbox")
              : "Messages downloaded during the latest sync."}
          </DialogDescription>
        </DialogHeader>
        {syncing && (statusMessage || subject) ? (
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            {statusMessage ? <p className="font-medium">{statusMessage}</p> : null}
            {subject ? (
              <p className="mt-0.5 truncate text-muted-foreground" title={subject}>
                {subject}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto border-t py-2">
          {logEntries.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted-foreground">No log entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {logEntries.map((entry, index) => {
                const isLatest = index === logEntries.length - 1;
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm",
                      syncing && isLatest ? "border-primary/40 bg-primary/5" : "bg-muted/20",
                    )}
                  >
                    <p className="font-medium">{entry.message}</p>
                    {entry.subject ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {entry.subject}
                      </p>
                    ) : null}
                  </li>
                );
              })}
              <div ref={logEndRef} />
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
