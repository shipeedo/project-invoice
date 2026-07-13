import { asc, desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { RoutingRulesManager } from "@/components/routing-rules-manager";
import { db, escalationRules, routingRules, suppliers, users } from "@/lib/db";
import { getNavCounts } from "@/lib/nav-counts";
import { requireRole } from "@/lib/session";

export default async function RoutingRulesPage() {
  const session = await requireRole(["ADMIN"]);

  const [rules, escalations, orgUsers, orgSuppliers, navCounts] = await Promise.all([
    db.query.routingRules.findMany({
      where: eq(routingRules.organizationId, session.user.organizationId),
      with: {
        approver: { columns: { id: true, name: true, email: true } },
      },
      orderBy: desc(routingRules.priority),
    }),
    db.query.escalationRules.findMany({
      where: eq(escalationRules.organizationId, session.user.organizationId),
      with: {
        watchedUser: { columns: { id: true, name: true, email: true } },
        escalateTo: { columns: { id: true, name: true, email: true } },
      },
      orderBy: asc(escalationRules.afterBusinessDays),
    }),
    db.query.users.findMany({
      where: eq(users.organizationId, session.user.organizationId),
      columns: { id: true, name: true, email: true },
      orderBy: (table, { asc }) => [asc(table.name)],
    }),
    db.query.suppliers.findMany({
      where: eq(suppliers.organizationId, session.user.organizationId),
      columns: { id: true, name: true },
      orderBy: (table, { asc }) => [asc(table.name)],
    }),
    getNavCounts(session.user.organizationId, session.user.id),
  ]);

  return (
    <AppShell
      user={session.user}
      activePath="/admin/routing-rules"
      navCounts={navCounts}
      breadcrumbs={[
        { label: "Admin" },
        { label: "Routing rules" },
      ]}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Routing rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose who approves each invoice, and what happens when one sits idle.
          </p>
        </div>
        <RoutingRulesManager
          initialRules={rules}
          initialEscalations={escalations}
          users={orgUsers}
          suppliers={orgSuppliers}
        />
      </div>
    </AppShell>
  );
}
