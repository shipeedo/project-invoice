import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rules = await db.routingRule.findMany({
    where: { organizationId: session.user.organizationId },
    include: {
      approver: { select: { id: true, name: true, email: true } },
    },
    orderBy: { priority: "desc" },
  });

  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name: string;
    priority: number;
    type: "SENDER_EMAIL" | "AMOUNT_THRESHOLD" | "PARSE_FAILURE" | "DEFAULT";
    condition: Record<string, unknown>;
    approverId?: string;
    isDefault?: boolean;
  };

  if (!body.name || body.priority == null || !body.type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (body.isDefault) {
    await db.routingRule.updateMany({
      where: { organizationId: session.user.organizationId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const rule = await db.routingRule.create({
    data: {
      organizationId: session.user.organizationId,
      name: body.name,
      priority: body.priority,
      type: body.type,
      condition: JSON.stringify(body.condition ?? {}),
      approverId: body.approverId,
      isDefault: Boolean(body.isDefault),
    },
    include: {
      approver: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(rule, { status: 201 });
}
