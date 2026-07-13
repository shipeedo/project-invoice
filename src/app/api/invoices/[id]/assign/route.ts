import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { db, invoices, users } from "@/lib/db";
import { createNotification, invoiceSummaryLine } from "@/lib/notifications";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    assigneeId?: string | null;
  };
  const assigneeId =
    typeof body.assigneeId === "string" && body.assigneeId.trim()
      ? body.assigneeId.trim()
      : null;

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
      isNull(invoices.deletedAt),
    ),
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (invoice.status === "CANCELLED") {
    return NextResponse.json(
      { error: "A cancelled invoice cannot be assigned" },
      { status: 400 },
    );
  }

  let assignee = null;
  if (assigneeId) {
    assignee = await db.query.users.findFirst({
      where: and(
        eq(users.id, assigneeId),
        eq(users.organizationId, session.user.organizationId),
        eq(users.hasAccess, true),
      ),
    });
    if (!assignee) {
      return NextResponse.json({ error: "Assignee not found" }, { status: 400 });
    }
  }

  if (invoice.assignedToId === assigneeId) {
    return NextResponse.json(invoice);
  }

  const [updated] = await db
    .update(invoices)
    .set({
      assignedToId: assigneeId,
      assignedAt: assigneeId ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, id))
    .returning();

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.assigned",
    details: {
      assignedToId: assigneeId,
      assignedToEmail: assignee?.email ?? null,
      previousAssignedToId: invoice.assignedToId,
    },
  });

  if (assignee && assignee.id !== session.user.id) {
    await createNotification({
      organizationId: session.user.organizationId,
      recipientId: assignee.id,
      actorId: session.user.id,
      invoiceId: id,
      type: "INVOICE_ASSIGNED",
      title: "Invoice assigned to you",
      body: invoiceSummaryLine(invoice),
      auditDetails: { recipientEmail: assignee.email, via: "manual" },
    });
  }

  return NextResponse.json(updated);
}
