import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { EscalationRulesManager } from "@/components/escalation-rules-manager";
import { db, escalationRules, users } from "@/lib/db";
import { requireRole } from "@/lib/session";

export default async function EscalationRulesPage() {
  const session = await requireRole(["ADMIN"]);

  const [rules, orgUsers] = await Promise.all([
    db.query.escalationRules.findMany({
      where: eq(escalationRules.organizationId, session.user.organizationId),
      with: {
        escalateTo: { columns: { id: true, name: true, email: true } },
      },
      orderBy: desc(escalationRules.priority),
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
      activePath="/admin/escalation-rules"
      breadcrumbs={[{ label: "Admin" }, { label: "Escalation rules" }]}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Escalation rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Automatically reassign invoices when an approver has not acted within a
            configured number of days. Escalation runs on a daily schedule.
          </p>
        </div>
        <EscalationRulesManager initialRules={rules} users={orgUsers} />
      </div>
    </AppShell>
  );
}
