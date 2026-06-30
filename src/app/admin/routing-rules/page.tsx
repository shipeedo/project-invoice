import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { RoutingRulesManager } from "@/components/routing-rules-manager";
import { db, routingRules, users } from "@/lib/db";
import { requireRole } from "@/lib/session";

export default async function RoutingRulesPage() {
  const session = await requireRole(["ADMIN"]);

  const [rules, orgUsers] = await Promise.all([
    db.query.routingRules.findMany({
      where: eq(routingRules.organizationId, session.user.organizationId),
      with: {
        approver: { columns: { id: true, name: true, email: true } },
      },
      orderBy: desc(routingRules.priority),
    }),
    db.query.users.findMany({
      where: eq(users.organizationId, session.user.organizationId),
      columns: { id: true, name: true, email: true },
      orderBy: (table, { asc }) => [asc(table.name)],
    }),
  ]);

  return (
    <AppShell
      user={session.user}
      activePath="/admin/routing-rules"
      breadcrumbs={[
        { label: "Admin" },
        { label: "Routing rules" },
      ]}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Routing rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Decide which approver receives each invoice after validation. Rules are checked
            from top to bottom — the first match wins. The catch-all default rule handles
            anything that does not match above it.
          </p>
        </div>
        <RoutingRulesManager initialRules={rules} users={orgUsers} />
      </div>
    </AppShell>
  );
}
