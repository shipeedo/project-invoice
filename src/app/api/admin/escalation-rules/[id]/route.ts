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
    watchedUserId?: string | null;
    afterBusinessDays?: number;
    escalateToId?: string;
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

  if (body.afterBusinessDays !== undefined) {
    const days = Number(body.afterBusinessDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      return NextResponse.json(
        { error: "afterBusinessDays must be between 1 and 30" },
        { status: 400 },
      );
    }
  }

  const watchedUserId =
    body.watchedUserId === undefined
      ? existing.watchedUserId
      : body.watchedUserId || null;
  const escalateToId = body.escalateToId ?? existing.escalateToId;
  if (watchedUserId && watchedUserId === escalateToId) {
    return NextResponse.json(
      { error: "Cannot escalate an invoice back to the same person" },
      { status: 400 },
    );
  }

  await db
    .update(escalationRules)
    .set({
      watchedUserId,
      afterBusinessDays: body.afterBusinessDays,
      escalateToId: body.escalateToId,
      enabled: body.enabled,
      updatedAt: new Date(),
    })
    .where(eq(escalationRules.id, id));

  const rule = await db.query.escalationRules.findFirst({
    where: eq(escalationRules.id, id),
    with: {
      watchedUser: { columns: { id: true, name: true, email: true } },
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
