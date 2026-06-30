import { AppShell } from "@/components/app-shell";
import { RoutingRulesManager } from "@/components/routing-rules-manager";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

export default async function RoutingRulesPage() {
  const session = await requireRole(["ADMIN"]);

  const [rules, users] = await Promise.all([
    db.routingRule.findMany({
      where: { organizationId: session.user.organizationId },
      include: {
        approver: { select: { id: true, name: true, email: true } },
      },
      orderBy: { priority: "desc" },
    }),
    db.user.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <AppShell user={session.user}>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Routing rules</h2>
          <p className="mt-1 text-sm text-slate-600">
            Rules are evaluated by priority. Higher priority wins. The default rule catches unmatched invoices.
          </p>
        </div>
        <RoutingRulesManager initialRules={rules} users={users} />
      </div>
    </AppShell>
  );
}
