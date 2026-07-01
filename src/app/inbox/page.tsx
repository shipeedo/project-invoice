import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { InboxLayout } from "@/components/inbox-layout";
import { loadInboxConnection, loadInboxThreads } from "@/lib/inbox-data";
import { requireSession } from "@/lib/session";

export default async function InboxPage() {
  const session = await requireSession();

  const [threads, connection] = await Promise.all([
    loadInboxThreads(session.user.organizationId),
    loadInboxConnection(session.user.organizationId),
  ]);

  const connected = connection?.status === "CONNECTED";

  return (
    <AppShell user={session.user} activePath="/inbox" breadcrumbs={[{ label: "Inbox" }]}>
      <InboxLayout threads={threads} connected={connected}>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          {threads.length === 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                {connected
                  ? "No emails synced yet. Sync the mailbox from Admin → Office 365."
                  : "Connect Office 365 and select a shared mailbox to view emails here."}
              </p>
              {!connected ? (
                <Link
                  href="/admin/o365"
                  className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Connect Office 365
                </Link>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a conversation to read and reply.
            </p>
          )}
        </div>
      </InboxLayout>
    </AppShell>
  );
}
