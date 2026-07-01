import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { InboxThreadList, type InboxThreadSummary } from "@/components/inbox-thread-list";
import { cn } from "@/lib/utils";

type InboxLayoutProps = {
  threads: InboxThreadSummary[];
  activeThreadId?: string | null;
  connected: boolean;
  children: React.ReactNode;
};

export function InboxLayout({
  threads,
  activeThreadId,
  connected,
  children,
}: InboxLayoutProps) {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Inbox</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Shared mailbox conversations. Invoices are processed automatically only
            from known suppliers.
          </p>
        </div>
        {!connected ? (
          <Link href="/admin/o365" className={cn(buttonVariants({ variant: "outline" }))}>
            Connect Office 365
          </Link>
        ) : null}
      </div>

      <div className="flex min-h-[calc(100vh-5rem)] flex-1 overflow-hidden rounded-xl border bg-background shadow-sm">
        <aside
          className={cn(
            "flex w-full shrink-0 flex-col border-r bg-muted/20 md:w-[min(100%,350px)]",
            activeThreadId && "hidden md:flex",
          )}
          style={{ maxWidth: 350 }}
        >
          <InboxThreadList threads={threads} activeThreadId={activeThreadId} />
        </aside>
        <main
          className={cn(
            "min-w-0 flex-1 flex-col",
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
