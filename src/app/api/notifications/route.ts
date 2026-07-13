import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, notifications, users } from "@/lib/db";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const beforeParam = Number.parseInt(url.searchParams.get("before") ?? "", 10);
  const before = Number.isFinite(beforeParam) ? new Date(beforeParam) : null;

  const recipientFilter = eq(notifications.recipientId, session.user.id);

  const [items, [unread]] = await Promise.all([
    db.query.notifications.findMany({
      where: before
        ? and(recipientFilter, lt(notifications.createdAt, before))
        : recipientFilter,
      orderBy: desc(notifications.createdAt),
      limit,
    }),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(recipientFilter, isNull(notifications.readAt))),
    // Heartbeat: the bell polls this endpoint, so it doubles as a
    // "client last checked for notifications" activity signal.
    db
      .update(users)
      .set({ lastNotificationCheckAt: new Date() })
      .where(eq(users.id, session.user.id)),
  ]);

  return NextResponse.json({
    notifications: items,
    unreadCount: unread?.value ?? 0,
  });
}

// Clear the caller's notification feed. The audit trail (audit_events) is
// untouched — this only empties the in-app list.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .delete(notifications)
    .where(eq(notifications.recipientId, session.user.id));

  return NextResponse.json({ ok: true });
}
