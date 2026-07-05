import Link from "next/link";
import { notFound } from "next/navigation";
import { InboxThreadView } from "@/components/inbox-thread-view";
import { loadInboxThread } from "@/lib/inbox-data";
import { requireSession } from "@/lib/session";

type PageProps = {
  params: Promise<{ threadId: string }>;
};

export default async function InboxThreadPage({ params }: PageProps) {
  const session = await requireSession();
  const { threadId } = await params;

  const thread = await loadInboxThread(session.user.organizationId, threadId);

  if (!thread) {
    notFound();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2 md:hidden">
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
        messages={thread.messages}
      />
    </div>
  );
}
