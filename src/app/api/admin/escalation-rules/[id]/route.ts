import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, escalationRules } from "@/lib/db";

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
    daysWithoutAction?: number;
    escalateToUserId?: string;
    enabled?: boolean;
  };

  const existing = await db.query.escalationRules.findFirst({
    where: and(
      eq(escalationRules.id, id),
      eq(escalationRules.organizationId, session.user.organizationId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    body.daysWithoutAction != null &&
    (!Number.isInteger(body.daysWithoutAction) || body.daysWithoutAction < 1)
  ) {
    return NextResponse.json(
      { error: "Days without action must be a positive integer" },
      { status: 400 },
    );
  }

  await db
    .update(escalationRules)
    .set({
      name: body.name,
      priority: body.priority,
      daysWithoutAction: body.daysWithoutAction,
      escalateToUserId: body.escalateToUserId,
      enabled: body.enabled,
      updatedAt: new Date(),
    })
    .where(eq(escalationRules.id, id));

  const rule = await db.query.escalationRules.findFirst({
    where: eq(escalationRules.id, id),
    with: {
      escalateTo: { columns: { id: true, name: true, email: true } },
    },
  });

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
  const existing = await db.query.escalationRules.findFirst({
    where: and(
      eq(escalationRules.id, id),
      eq(escalationRules.organizationId, session.user.organizationId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(escalationRules).where(eq(escalationRules.id, id));
  return NextResponse.json({ ok: true });
}
