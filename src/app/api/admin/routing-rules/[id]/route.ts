import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
    type?: "SENDER_EMAIL" | "AMOUNT_THRESHOLD" | "PARSE_FAILURE" | "DEFAULT";
    condition?: Record<string, unknown>;
    approverId?: string | null;
    enabled?: boolean;
    isDefault?: boolean;
  };

  const existing = await db.routingRule.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.isDefault) {
    await db.routingRule.updateMany({
      where: {
        organizationId: session.user.organizationId,
        isDefault: true,
        NOT: { id },
      },
      data: { isDefault: false },
    });
  }

  const rule = await db.routingRule.update({
    where: { id },
    data: {
      name: body.name,
      priority: body.priority,
      type: body.type,
      condition: body.condition ? JSON.stringify(body.condition) : undefined,
      approverId: body.approverId,
      enabled: body.enabled,
      isDefault: body.isDefault,
    },
    include: {
      approver: { select: { id: true, name: true, email: true } },
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
  const existing = await db.routingRule.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.isDefault) {
    return NextResponse.json({ error: "Cannot delete the default routing rule" }, { status: 400 });
  }

  await db.routingRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
