import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, routingRules } from "@/lib/db";

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
    type?: "SUPPLIER" | "SENDER_EMAIL" | "AMOUNT_THRESHOLD" | "PARSE_FAILURE" | "DEFAULT";
    condition?: Record<string, unknown>;
    approverId?: string | null;
    enabled?: boolean;
    isDefault?: boolean;
  };

  const existing = await db.query.routingRules.findFirst({
    where: and(
      eq(routingRules.id, id),
      eq(routingRules.organizationId, session.user.organizationId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.isDefault) {
    await db
      .update(routingRules)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(routingRules.organizationId, session.user.organizationId),
          ne(routingRules.id, id),
        ),
      );
  }

  await db
    .update(routingRules)
    .set({
      name: body.name,
      priority: body.priority,
      type: body.type,
      condition: body.condition ? JSON.stringify(body.condition) : undefined,
      approverId: body.approverId,
      enabled: body.enabled,
      isDefault: body.isDefault,
      updatedAt: new Date(),
    })
    .where(eq(routingRules.id, id));

  const rule = await db.query.routingRules.findFirst({
    where: eq(routingRules.id, id),
    with: {
      approver: { columns: { id: true, name: true, email: true } },
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
  const existing = await db.query.routingRules.findFirst({
    where: and(
      eq(routingRules.id, id),
      eq(routingRules.organizationId, session.user.organizationId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.isDefault) {
    return NextResponse.json(
      { error: "Cannot delete the default routing rule" },
      { status: 400 },
    );
  }

  await db.delete(routingRules).where(eq(routingRules.id, id));
  return NextResponse.json({ ok: true });
}
