import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { db, users } from "@/lib/db";
import type { UserRole } from "@/lib/db/types";
import { userRoles } from "@/lib/db/types";
import { getUserByEmail } from "@/lib/users";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.query.users.findMany({
    where: and(
      eq(users.organizationId, session.user.organizationId),
      eq(users.hasAccess, true),
    ),
    columns: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: asc(users.name),
  });

  return NextResponse.json(rows);
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
    email?: string;
    name?: string;
    role?: string;
  };

  const email = body.email?.trim();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const role: UserRole =
    body.role && userRoles.includes(body.role as UserRole)
      ? (body.role as UserRole)
      : "APPROVER";
  const name = body.name?.trim() || email;

  const existing = await getUserByEmail(email);
  if (existing && existing.organizationId !== session.user.organizationId) {
    return NextResponse.json(
      { error: "This user belongs to another organization" },
      { status: 409 },
    );
  }

  let user;
  if (existing) {
    [user] = await db
      .update(users)
      .set({
        hasAccess: true,
        role,
        name: body.name?.trim() || existing.name,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
  } else {
    [user] = await db
      .insert(users)
      .values({
        organizationId: session.user.organizationId,
        email,
        name,
        role,
        hasAccess: true,
      })
      .returning();
  }

  await recordAuditEvent({
    userId: session.user.id,
    action: "user.access_granted",
    details: { targetUserId: user.id, email: user.email, role: user.role },
  });

  return NextResponse.json(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    { status: existing ? 200 : 201 },
  );
}
