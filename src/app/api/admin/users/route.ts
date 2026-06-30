import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.query.users.findMany({
    where: eq(users.organizationId, session.user.organizationId),
    columns: { id: true, name: true, email: true, role: true },
    orderBy: asc(users.name),
  });

  return NextResponse.json(rows);
}
