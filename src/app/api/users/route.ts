import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";

// Org user list for pickers (e.g. invoice assignee). Unlike /api/admin/users
// this is available to every signed-in user, but exposes only directory basics.
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.query.users.findMany({
    where: and(
      eq(users.organizationId, session.user.organizationId),
      eq(users.hasAccess, true),
    ),
    columns: { id: true, name: true, email: true, role: true },
    orderBy: asc(users.name),
  });

  return NextResponse.json({ users: rows });
}
