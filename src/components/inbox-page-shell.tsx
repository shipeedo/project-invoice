"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InboxLayout } from "@/components/inbox-layout";
import type { InboxThreadSummary } from "@/components/inbox-thread-list";
import type { UserRole } from "@/lib/db/types";

type InboxPageShellProps = {
  user: {
    name?: string | null;
    email?: string | null;
    role: UserRole;
  };
  threads: InboxThreadSummary[];
  sync: {
    canSync: boolean;
    lastSyncedAt: string | null;
  };
  children: React.ReactNode;
};

function activeThreadIdFromPath(pathname: string) {
  const match = pathname.match(/^\/inbox\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function InboxPageShell({
  user,
  threads,
  sync,
  children,
}: InboxPageShellProps) {
  const pathname = usePathname();
  const activeThreadId = activeThreadIdFromPath(pathname);
  const activeThread = activeThreadId
    ? threads.find((thread) => thread.id === activeThreadId)
    : null;

  const breadcrumbs = activeThread
    ? [
        { label: "Inbox", href: "/inbox" },
        { label: activeThread.subject ?? "Thread" },
      ]
    : [{ label: "Inbox" }];

  return (
    <AppShell
      user={user}
      activePath="/inbox"
      fillViewport
      breadcrumbs={breadcrumbs}
    >
      <InboxLayout threads={threads} activeThreadId={activeThreadId} sync={sync}>
        {children}
      </InboxLayout>
    </AppShell>
  );
}
