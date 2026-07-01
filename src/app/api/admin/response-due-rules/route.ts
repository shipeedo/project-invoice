import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, responseDueRules } from "@/lib/db";
import type { ResponseDueRuleAnchor, ResponseDueRuleDirection } from "@/lib/db/types";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rules = await db.query.responseDueRules.findMany({
    where: eq(responseDueRules.organizationId, session.user.organizationId),
    orderBy: desc(responseDueRules.priority),
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
    anchor: ResponseDueRuleAnchor;
    offsetDays: number;
    direction: ResponseDueRuleDirection;
  };

  if (!body.name || body.priority == null || !body.anchor || !body.direction) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!Number.isInteger(body.offsetDays) || body.offsetDays < 0) {
    return NextResponse.json({ error: "Offset days must be a non-negative integer" }, { status: 400 });
  }

  const [rule] = await db
    .insert(responseDueRules)
    .values({
      organizationId: session.user.organizationId,
      name: body.name,
      priority: body.priority,
      anchor: body.anchor,
      offsetDays: body.offsetDays,
      direction: body.direction,
    })
    .returning();

  return NextResponse.json(rule, { status: 201 });
}
