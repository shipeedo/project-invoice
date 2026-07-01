import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, responseDueRules } from "@/lib/db";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { orderedIds: string[] };
  if (!Array.isArray(body.orderedIds)) {
    return NextResponse.json({ error: "orderedIds must be an array" }, { status: 400 });
  }

  const existing = await db.query.responseDueRules.findMany({
    where: eq(responseDueRules.organizationId, session.user.organizationId),
  });

  const existingIds = new Set(existing.map((rule) => rule.id));
  if (
    body.orderedIds.length !== existing.length ||
    !body.orderedIds.every((id) => existingIds.has(id))
  ) {
    return NextResponse.json({ error: "Invalid rule order" }, { status: 400 });
  }

  const now = new Date();
  await Promise.all(
    body.orderedIds.map((id, index) =>
      db
        .update(responseDueRules)
        .set({ priority: (body.orderedIds.length - index) * 10, updatedAt: now })
        .where(
          and(
            eq(responseDueRules.id, id),
            eq(responseDueRules.organizationId, session.user.organizationId),
          ),
        ),
    ),
  );

  const rules = await db.query.responseDueRules.findMany({
    where: eq(responseDueRules.organizationId, session.user.organizationId),
    orderBy: (table, { desc: orderDesc }) => [orderDesc(table.priority)],
  });

  return NextResponse.json(rules);
}
