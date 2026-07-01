import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, escalationRules } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rules = await db.query.escalationRules.findMany({
    where: eq(escalationRules.organizationId, session.user.organizationId),
    with: {
      escalateTo: { columns: { id: true, name: true, email: true } },
    },
    orderBy: desc(escalationRules.priority),
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
    daysWithoutAction: number;
    escalateToUserId: string;
  };

  if (!body.name || body.priority == null || !body.escalateToUserId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!Number.isInteger(body.daysWithoutAction) || body.daysWithoutAction < 1) {
    return NextResponse.json(
      { error: "Days without action must be a positive integer" },
      { status: 400 },
    );
  }

  const [rule] = await db
    .insert(escalationRules)
    .values({
      organizationId: session.user.organizationId,
      name: body.name,
      priority: body.priority,
      daysWithoutAction: body.daysWithoutAction,
      escalateToUserId: body.escalateToUserId,
    })
    .returning();

  const withUser = await db.query.escalationRules.findFirst({
    where: eq(escalationRules.id, rule.id),
    with: {
      escalateTo: { columns: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(withUser, { status: 201 });
}
