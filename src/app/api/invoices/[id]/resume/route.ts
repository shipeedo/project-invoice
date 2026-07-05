import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, invoices } from "@/lib/db";
import { invoiceStatuses, type InvoiceStatus } from "@/lib/db/types";
import { recordAuditEvent } from "@/lib/audit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
    ),
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (invoice.status !== "ON_HOLD") {
    return NextResponse.json({ error: "Invoice is not on hold" }, { status: 400 });
  }

  if (session.user.role !== "ADMIN" && invoice.assignedToId !== session.user.id) {
    return NextResponse.json(
      { error: "Only the assignee or an admin can release a hold" },
      { status: 403 },
    );
  }

  const restoredStatus = invoiceStatuses.includes(
    invoice.holdPreviousStatus as InvoiceStatus,
  )
    ? (invoice.holdPreviousStatus as InvoiceStatus)
    : "PENDING_APPROVAL";

  const [updated] = await db
    .update(invoices)
    .set({
      status: restoredStatus,
      holdPreviousStatus: null,
      onHoldAt: null,
      onHoldById: null,
      onHoldReason: null,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, id))
    .returning();

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.hold_released",
    details: { restoredStatus },
  });

  return NextResponse.json(updated);
}
