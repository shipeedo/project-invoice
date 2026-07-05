import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, invoices } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { HOLDABLE_STATUSES } from "@/lib/invoice-status";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
    ),
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!HOLDABLE_STATUSES.includes(invoice.status)) {
    return NextResponse.json(
      { error: "Invoice cannot be placed on hold in its current status" },
      { status: 400 },
    );
  }

  if (session.user.role !== "ADMIN" && invoice.assignedToId !== session.user.id) {
    return NextResponse.json(
      { error: "Only the assignee or an admin can place an invoice on hold" },
      { status: 403 },
    );
  }

  const reason = body.reason?.trim() || null;

  const [updated] = await db
    .update(invoices)
    .set({
      status: "ON_HOLD",
      holdPreviousStatus: invoice.status,
      onHoldAt: new Date(),
      onHoldById: session.user.id,
      onHoldReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, id))
    .returning();

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.held",
    details: { reason, previousStatus: invoice.status },
  });

  return NextResponse.json(updated);
}
