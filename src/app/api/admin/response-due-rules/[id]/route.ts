import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, responseDueRules } from "@/lib/db";
import type { ResponseDueRuleAnchor, ResponseDueRuleDirection } from "@/lib/db/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    priority?: number;
    anchor?: ResponseDueRuleAnchor;
    offsetDays?: number;
    direction?: ResponseDueRuleDirection;
    enabled?: boolean;
  };

  const existing = await db.query.responseDueRules.findFirst({
    where: and(
      eq(responseDueRules.id, id),
      eq(responseDueRules.organizationId, session.user.organizationId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    body.offsetDays != null &&
    (!Number.isInteger(body.offsetDays) || body.offsetDays < 0)
  ) {
    return NextResponse.json({ error: "Offset days must be a non-negative integer" }, { status: 400 });
  }

  const [rule] = await db
    .update(responseDueRules)
    .set({
      name: body.name,
      priority: body.priority,
      anchor: body.anchor,
      offsetDays: body.offsetDays,
      direction: body.direction,
      enabled: body.enabled,
      updatedAt: new Date(),
    })
    .where(eq(responseDueRules.id, id))
    .returning();

  return NextResponse.json(rule);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await db.query.responseDueRules.findFirst({
    where: and(
      eq(responseDueRules.id, id),
      eq(responseDueRules.organizationId, session.user.organizationId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(responseDueRules).where(eq(responseDueRules.id, id));
  return NextResponse.json({ ok: true });
}
