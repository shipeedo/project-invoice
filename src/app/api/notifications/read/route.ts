import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, notifications } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    ids?: string[];
    all?: boolean;
  };

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id) => typeof id === "string")
    : [];
  if (!body.all && ids.length === 0) {
    return NextResponse.json(
      { error: "Provide ids or all: true" },
      { status: 400 },
    );
  }

  const unreadMine = and(
    eq(notifications.recipientId, session.user.id),
    isNull(notifications.readAt),
  );

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(body.all ? unreadMine : and(unreadMine, inArray(notifications.id, ids)));

  return NextResponse.json({ ok: true });
}
