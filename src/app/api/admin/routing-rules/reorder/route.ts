import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, routingRules } from "@/lib/db";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { orderedIds: string[] };
  if (!Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
    return NextResponse.json({ error: "orderedIds is required" }, { status: 400 });
  }

  const rules = await db.query.routingRules.findMany({
    where: eq(routingRules.organizationId, session.user.organizationId),
  });

  if (rules.length !== body.orderedIds.length) {
    return NextResponse.json({ error: "Invalid rule set" }, { status: 400 });
  }

  const maxPriority = body.orderedIds.length * 10;
  await db.transaction(async (tx) => {
    for (const [index, id] of body.orderedIds.entries()) {
      await tx
        .update(routingRules)
        .set({ priority: maxPriority - index * 10, updatedAt: new Date() })
        .where(eq(routingRules.id, id));
    }
  });

  const updated = await db.query.routingRules.findMany({
    where: eq(routingRules.organizationId, session.user.organizationId),
    with: {
      approver: { columns: { id: true, name: true, email: true } },
    },
    orderBy: desc(routingRules.priority),
  });

  return NextResponse.json(updated);
}
