import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (
    !user ||
    user.organizationId !== session.user.organizationId ||
    !user.hasAccess
  ) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const senderName = session.user.name ?? session.user.email ?? "an admin";
  const delivery = await createNotification({
    organizationId: session.user.organizationId,
    recipientId: user.id,
    actorId: session.user.id,
    type: "TEST",
    title: "Test notification",
    body: `Sent by ${senderName} to check that your notifications are working.`,
    auditAction: "notification.test_sent",
    auditDetails: { recipientEmail: user.email },
  });

  if (!delivery) {
    return NextResponse.json(
      { error: "The test notification could not be created" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, delivery });
}
