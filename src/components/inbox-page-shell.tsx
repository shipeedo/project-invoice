"use client";

import { usePathname } from "next/navigation";
import {
  AppShellView,
  type AiBalanceWarning,
  type MailboxConnectionSummary,
} from "@/components/app-shell-view";
import { InboxLayout } from "@/components/inbox-layout";
import type { InboxThreadSummary } from "@/components/inbox-thread-list";
import type { UserRole } from "@/lib/db/types";
import type { NavCounts } from "@/lib/nav-counts";

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
  navCounts?: NavCounts;
  mailboxConnection?: MailboxConnectionSummary | null;
  aiBalanceWarning?: AiBalanceWarning | null;
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
  navCounts,
  mailboxConnection,
  aiBalanceWarning,
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
    <AppShellView
      user={user}
      activePath="/inbox"
      navCounts={navCounts}
      fillViewport
      breadcrumbs={breadcrumbs}
      mailboxConnection={mailboxConnection}
      aiBalanceWarning={aiBalanceWarning}
    >
      <InboxLayout threads={threads} activeThreadId={activeThreadId} sync={sync}>
        {children}
      </InboxLayout>
    </AppShellView>
  );
}
