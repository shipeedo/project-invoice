import { and, asc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { UsersManager } from "@/components/users-manager";
import { db, users } from "@/lib/db";
import { requireRole } from "@/lib/session";

export default async function UsersPage() {
  const session = await requireRole(["ADMIN"]);

  const rows = await db.query.users.findMany({
    where: and(
      eq(users.organizationId, session.user.organizationId),
      eq(users.hasAccess, true),
    ),
    columns: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: asc(users.name),
  });

  return (
    <AppShell
      user={session.user}
      activePath="/admin/users"
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
