import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { db, users } from "@/lib/db";

export async function DELETE(
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

  if (id === session.user.id) {
    return NextResponse.json(
      { error: "You can't remove your own access" },
      { status: 400 },
    );
  }

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user || user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Revoke access only — the user record (and its history) is kept, and the
  // account still exists on the auth server.
  await db
    .update(users)
    .set({ hasAccess: false, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await recordAuditEvent({
    userId: session.user.id,
    action: "user.access_revoked",
    details: { targetUserId: user.id, email: user.email },
  });

  return NextResponse.json({ ok: true });
}
