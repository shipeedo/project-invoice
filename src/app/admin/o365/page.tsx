import { AppShell } from "@/components/app-shell";
import { O365Settings } from "@/components/o365-settings";
import { getO365Connection } from "@/lib/o365/connection";
import { isO365Configured } from "@/lib/o365/config";
import { getNavCounts } from "@/lib/nav-counts";
import { requireRole } from "@/lib/session";

type PageProps = {
  searchParams: Promise<{ connected?: string; error?: string }>;
};

export default async function O365SettingsPage({ searchParams }: PageProps) {
  const session = await requireRole(["ADMIN"]);
  const params = await searchParams;
  const [connection, navCounts] = await Promise.all([
    getO365Connection(session.user.organizationId),
    getNavCounts(session.user.organizationId),
  ]);

  let initialMailboxes: Array<{
    id: string;
    displayName: string;
    mail: string;
    userPrincipalName: string;
  }> = [];

  if (connection?.selectedMailboxId && connection.selectedMailboxUpn) {
    initialMailboxes = [
      {
        id: connection.selectedMailboxId,
        displayName: connection.selectedMailboxUpn,
        mail: connection.selectedMailboxUpn,
        userPrincipalName: connection.selectedMailboxUpn,
      },
    ];
  }

  const initialStatus = {
    configured: isO365Configured(),
    status: connection?.status ?? ("DISCONNECTED" as const),
    mailboxUpn: connection?.selectedMailboxUpn ?? null,
    mailboxId: connection?.selectedMailboxId ?? null,
    connectedAt: connection?.connectedAt?.toISOString() ?? null,
    lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
    lastError: connection?.lastError ?? null,
    microsoftTenantId: connection?.microsoftTenantId ?? null,
  };

  return (
    <AppShell
      user={session.user}
      activePath="/admin/o365"
      navCounts={navCounts}
      breadcrumbs={[{ label: "Admin" }, { label: "Office 365" }]}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Office 365</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a shared mailbox so invoice emails are imported automatically for
            everyone in your organization.
          </p>
        </div>
        <O365Settings
          initialStatus={initialStatus}
          initialMailboxes={initialMailboxes}
          connected={params.connected === "1"}
          errorMessage={params.error ?? null}
        />
      </div>
    </AppShell>
  );
}
