import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InboxThreadView } from "@/components/inbox-thread-view";
import { db, emailThreads } from "@/lib/db";
import { requireSession } from "@/lib/session";

type PageProps = {
  params: Promise<{ threadId: string }>;
};

export default async function InboxThreadPage({ params }: PageProps) {
  const session = await requireSession();
  const { threadId } = await params;

  const thread = await db.query.emailThreads.findFirst({
    where: and(
      eq(emailThreads.id, threadId),
      eq(emailThreads.organizationId, session.user.organizationId),
    ),
    with: {
      supplier: { columns: { id: true, name: true } },
      messages: {
        with: {
          attachments: { columns: { id: true, fileName: true } },
          invoice: {
            columns: { id: true, vendorName: true, originalFileName: true },
          },
        },
        orderBy: (table, { asc }) => [asc(table.receivedAt)],
      },
    },
  });

  if (!thread) {
    notFound();
  }

  return (
    <AppShell
      user={session.user}
      activePath="/inbox"
      breadcrumbs={[
        { label: "Inbox", href: "/inbox" },
        { label: thread.subject ?? "Thread" },
      ]}
    >
      <InboxThreadView
        threadId={thread.id}
        subject={thread.subject}
        supplier={thread.supplier}
        messages={thread.messages}
      />
    </AppShell>
  );
}
