import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { ResponseDueRulesManager } from "@/components/response-due-rules-manager";
import { db, responseDueRules } from "@/lib/db";
import { requireRole } from "@/lib/session";

export default async function ResponseDueRulesPage() {
  const session = await requireRole(["ADMIN"]);

  const rules = await db.query.responseDueRules.findMany({
    where: eq(responseDueRules.organizationId, session.user.organizationId),
    orderBy: desc(responseDueRules.priority),
  });

  return (
    <AppShell
      user={session.user}
      activePath="/admin/response-due-rules"
      breadcrumbs={[{ label: "Admin" }, { label: "Response due rules" }]}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Response due rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set deadlines for approvers to allocate an outcome to each invoice. When an
            invoice is validated and assigned, the first matching rule determines the
            response due date.
          </p>
        </div>
        <ResponseDueRulesManager initialRules={rules} />
      </div>
    </AppShell>
  );
}
