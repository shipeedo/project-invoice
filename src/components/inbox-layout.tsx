import { InboxSyncControls } from "@/components/inbox-sync-controls";
import { InboxThreadList, type InboxThreadSummary } from "@/components/inbox-thread-list";
import { cn } from "@/lib/utils";

type InboxLayoutProps = {
  threads: InboxThreadSummary[];
  activeThreadId?: string | null;
  sync?: {
    canSync: boolean;
    lastSyncedAt: string | null;
  };
  children: React.ReactNode;
};

export function InboxLayout({
  threads,
  activeThreadId,
  sync,
  children,
}: InboxLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-background shadow-sm">
        <aside
          className={cn(
            "flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-r bg-muted/20 md:w-[min(100%,350px)]",
            activeThreadId && "hidden md:flex",
          )}
          style={{ maxWidth: 350 }}
        >
          {sync ? (
            <InboxSyncControls
              canSync={sync.canSync}
              lastSyncedAt={sync.lastSyncedAt}
            />
          ) : null}
          <InboxThreadList threads={threads} activeThreadId={activeThreadId} />
        </aside>
        <main
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            !activeThreadId && "hidden md:flex",
            activeThreadId && "flex",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
