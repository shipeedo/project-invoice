import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, routingRules } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rules = await db.query.routingRules.findMany({
    where: eq(routingRules.organizationId, session.user.organizationId),
    with: {
      approver: { columns: { id: true, name: true, email: true } },
    },
    orderBy: desc(routingRules.priority),
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
    type: "SUPPLIER" | "SENDER_EMAIL" | "AMOUNT_THRESHOLD" | "PARSE_FAILURE" | "DEFAULT";
    condition: Record<string, unknown>;
    approverId?: string;
    isDefault?: boolean;
  };

  if (!body.name || body.priority == null || !body.type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (body.isDefault) {
    await db
      .update(routingRules)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(routingRules.organizationId, session.user.organizationId));
  }

  const [rule] = await db
    .insert(routingRules)
    .values({
      organizationId: session.user.organizationId,
      name: body.name,
      priority: body.priority,
      type: body.type,
      condition: JSON.stringify(body.condition ?? {}),
      approverId: body.approverId,
      isDefault: Boolean(body.isDefault),
    })
    .returning();

  const withApprover = await db.query.routingRules.findFirst({
    where: eq(routingRules.id, rule.id),
    with: {
      approver: { columns: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(withApprover, { status: 201 });
}
