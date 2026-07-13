import { and, asc, count, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { UsersManager } from "@/components/users-manager";
import { db, pushSubscriptions, users } from "@/lib/db";
import { getNavCounts } from "@/lib/nav-counts";
import { requireRole } from "@/lib/session";

export default async function UsersPage() {
  const session = await requireRole(["ADMIN"]);

  const [userRows, subscriptionCounts, navCounts] = await Promise.all([
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

  const subscribedUserIds = new Set(subscriptionCounts.map((row) => row.userId));
  const rows = userRows.map((user) => ({
    ...user,
    pushEnabled: subscribedUserIds.has(user.id),
  }));

  return (
    <AppShell
      user={session.user}
      activePath="/admin/users"
      navCounts={navCounts}
      breadcrumbs={[{ label: "Admin" }, { label: "Users" }]}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Users</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Control who can use Project Invoice. Users sign in with their Shipeedo account,
            but only the people listed here get access.
          </p>
        </div>
        <UsersManager initialUsers={rows} currentUserId={session.user.id} />
      </div>
    </AppShell>
  );
}
