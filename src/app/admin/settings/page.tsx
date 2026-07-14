import { and, asc, count, eq } from "drizzle-orm";
import { MailIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AiProviderSection } from "@/components/ai-provider-section";
import { MailboxConnectionSection } from "@/components/mailbox-connection-section";
import { SettingsNav, type SettingsNavItem } from "@/components/settings-nav";
import { UsersManager } from "@/components/users-manager";
import {
  AI_CREDITS_LOW_THRESHOLD,
  getAiConnector,
  toAiConnectorSummary,
} from "@/lib/ai-connector";
import { db, pushSubscriptions, users } from "@/lib/db";
import {
  buildMailboxConnectionSummary,
  getO365Connection,
} from "@/lib/o365/connection";
import { getNavCounts } from "@/lib/nav-counts";
import { requireRole } from "@/lib/session";

export default async function AdminSettingsPage() {
  const session = await requireRole(["ADMIN"]);
  const [connection, aiConnector, userRows, subscriptionCounts, navCounts] =
    await Promise.all([
      getO365Connection(session.user.organizationId),
      getAiConnector(session.user.organizationId),
      db.query.users.findMany({
        where: and(
          eq(users.organizationId, session.user.organizationId),
          eq(users.hasAccess, true),
        ),
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          lastNotificationCheckAt: true,
        },
        orderBy: asc(users.name),
      }),
      db
        .select({ userId: pushSubscriptions.userId, value: count() })
        .from(pushSubscriptions)
        .groupBy(pushSubscriptions.userId),
      getNavCounts(session.user.organizationId, session.user.id),
    ]);

  const mailboxSummary = buildMailboxConnectionSummary(session.user, connection);
  const aiSummary = toAiConnectorSummary(aiConnector);
  const aiConfigured = Boolean(aiSummary?.hasApiKey && aiSummary?.model);
  const aiLowBalance =
    aiSummary?.creditsBalance != null &&
    aiSummary.creditsBalance < AI_CREDITS_LOW_THRESHOLD;

  const subscribedUserIds = new Set(subscriptionCounts.map((row) => row.userId));
  const userList = userRows.map((user) => ({
    ...user,
    pushEnabled: subscribedUserIds.has(user.id),
  }));

  const navItems: SettingsNavItem[] = [
    {
      id: "mailbox",
      label: "Mailbox",
      icon: <MailIcon />,
      status: mailboxSummary ? "ready" : "attention",
    },
    {
      id: "ai-provider",
      label: "AI provider",
      icon: <SparklesIcon />,
      status: aiConfigured && !aiLowBalance ? "ready" : "attention",
    },
    {
      id: "users",
      label: "Users",
      icon: <UsersIcon />,
    },
  ];

  return (
    <AppShell
      user={session.user}
      activePath="/admin/settings"
      navCounts={navCounts}
      breadcrumbs={[{ label: "Admin" }, { label: "Settings" }]}
    >
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            How invoices arrive, how they are read, and who can sign in.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
          <SettingsNav items={navItems} />

          <div className="min-w-0 space-y-6">
            <section id="mailbox" aria-label="Mailbox" className="scroll-mt-6">
              <MailboxConnectionSection
                connected={Boolean(mailboxSummary)}
                mailboxEmail={mailboxSummary?.email ?? null}
                lastSyncedLabel={mailboxSummary?.lastSyncedLabel ?? null}
              />
            </section>

            <section
              id="ai-provider"
              aria-label="AI provider"
              className="scroll-mt-6"
            >
              <AiProviderSection initialConnector={aiSummary} />
            </section>

            <section id="users" aria-label="Users" className="scroll-mt-6">
              <UsersManager
                initialUsers={userList}
                currentUserId={session.user.id}
              />
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
