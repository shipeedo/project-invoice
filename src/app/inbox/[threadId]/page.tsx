import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { InboxLayout } from "@/components/inbox-layout";
import { InboxThreadView } from "@/components/inbox-thread-view";
import {
  loadInboxConnection,
  loadInboxThread,
  loadInboxThreads,
} from "@/lib/inbox-data";
import { requireSession } from "@/lib/session";

type PageProps = {
  params: Promise<{ threadId: string }>;
};

export default async function InboxThreadPage({ params }: PageProps) {
  const session = await requireSession();
  const { threadId } = await params;

  const [threads, connection, thread] = await Promise.all([
    loadInboxThreads(session.user.organizationId),
    loadInboxConnection(session.user.organizationId),
    loadInboxThread(session.user.organizationId, threadId),
  ]);

  if (!thread) {
    notFound();
  }

  const connected = connection?.status === "CONNECTED";

  return (
    <AppShell
      user={session.user}
      activePath="/inbox"
      breadcrumbs={[
        { label: "Inbox", href: "/inbox" },
        { label: thread.subject ?? "Thread" },
      ]}
    >
      <InboxLayout
        threads={threads}
        activeThreadId={thread.id}
        connected={connected}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-4 py-2 md:hidden">
            <Link
              href="/inbox"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              ← Back to inbox
            </Link>
          </div>
          <InboxThreadView
            threadId={thread.id}
            subject={thread.subject}
            supplier={thread.supplier}
            messages={thread.messages}
          />
        </div>
      </InboxLayout>
    </AppShell>
  );
}
