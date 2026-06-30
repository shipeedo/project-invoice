import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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

  const rules = await db.routingRule.findMany({
    where: { organizationId: session.user.organizationId },
  });

  if (rules.length !== body.orderedIds.length) {
    return NextResponse.json({ error: "Invalid rule set" }, { status: 400 });
  }

  const maxPriority = body.orderedIds.length * 10;
  await db.$transaction(
    body.orderedIds.map((id, index) =>
      db.routingRule.update({
        where: { id },
        data: { priority: maxPriority - index * 10 },
      }),
    ),
  );

  const updated = await db.routingRule.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { priority: "desc" },
  });

  return NextResponse.json(updated);
}
