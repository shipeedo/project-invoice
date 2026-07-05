import { InboxPageShell } from "@/components/inbox-page-shell";
import { loadInboxConnection, loadInboxThreads } from "@/lib/inbox-data";
import { requireSession } from "@/lib/session";

export default async function InboxRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  const [threads, connection] = await Promise.all([
    loadInboxThreads(session.user.organizationId),
    loadInboxConnection(session.user.organizationId),
  ]);

  const canSync =
    Boolean(connection?.selectedMailboxUpn) &&
    connection?.status !== "DISCONNECTED" &&
    Boolean(connection?.accessTokenEncrypted);

  return (
    <InboxPageShell
      user={session.user}
      threads={threads}
      sync={{
        canSync,
        lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
      }}
    >
      {children}
    </InboxPageShell>
  );
}
