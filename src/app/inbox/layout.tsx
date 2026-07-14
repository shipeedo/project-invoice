import { InboxPageShell } from "@/components/inbox-page-shell";
import { getAiBalanceWarning } from "@/lib/ai-connector";
import { loadInboxConnection, loadInboxThreads } from "@/lib/inbox-data";
import { getNavCounts } from "@/lib/nav-counts";
import { buildMailboxConnectionSummary } from "@/lib/o365/connection";
import { requireSession } from "@/lib/session";

export default async function InboxRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  const [threads, connection, navCounts, aiBalanceWarning] = await Promise.all([
    loadInboxThreads(session.user.organizationId),
    loadInboxConnection(session.user.organizationId),
    getNavCounts(session.user.organizationId, session.user.id),
    getAiBalanceWarning(session.user.organizationId),
  ]);

  const canSync =
    Boolean(connection?.selectedMailboxUpn) &&
    connection?.status !== "DISCONNECTED" &&
    Boolean(connection?.accessTokenEncrypted);

  const mailboxConnection = buildMailboxConnectionSummary(
    session.user,
    connection,
  );

  return (
    <InboxPageShell
      user={session.user}
      threads={threads}
      navCounts={navCounts}
      mailboxConnection={mailboxConnection}
      aiBalanceWarning={aiBalanceWarning}
      sync={{
        canSync,
        lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
      }}
    >
      {children}
    </InboxPageShell>
  );
}
