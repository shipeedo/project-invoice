import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, escalationRules } from "@/lib/db";

const RULE_QUERY_OPTIONS = {
  with: {
    watchedUser: { columns: { id: true, name: true, email: true } },
    escalateTo: { columns: { id: true, name: true, email: true } },
  },
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rules = await db.query.escalationRules.findMany({
    where: eq(escalationRules.organizationId, session.user.organizationId),
    ...RULE_QUERY_OPTIONS,
    orderBy: asc(escalationRules.afterBusinessDays),
  });

  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    watchedUserId?: string | null;
    afterBusinessDays: number;
    escalateToId: string;
  };

  const afterBusinessDays = Number(body.afterBusinessDays);
  if (
    !Number.isInteger(afterBusinessDays) ||
    afterBusinessDays < 1 ||
    afterBusinessDays > 30
  ) {
    return NextResponse.json(
      { error: "afterBusinessDays must be between 1 and 30" },
      { status: 400 },
    );
  }

  if (!body.escalateToId) {
    return NextResponse.json({ error: "escalateToId is required" }, { status: 400 });
  }

  if (body.watchedUserId && body.watchedUserId === body.escalateToId) {
    return NextResponse.json(
      { error: "Cannot escalate an invoice back to the same person" },
      { status: 400 },
    );
  }

  const [rule] = await db
    .insert(escalationRules)
    .values({
      organizationId: session.user.organizationId,
      watchedUserId: body.watchedUserId || null,
      afterBusinessDays,
      escalateToId: body.escalateToId,
    })
    .returning();

  const withUsers = await db.query.escalationRules.findFirst({
    where: eq(escalationRules.id, rule.id),
    ...RULE_QUERY_OPTIONS,
  });

  return NextResponse.json(withUsers, { status: 201 });
}
