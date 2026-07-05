import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, invoices, notes } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { canCancelInvoice } from "@/lib/invoice-status";

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

  if (!canCancelInvoice(invoice.status)) {
    return NextResponse.json(
      { error: "Invoice cannot be cancelled in its current status" },
      { status: 400 },
    );
  }

  const reason = body.reason?.trim() || null;

  // better-sqlite3 transactions must stay synchronous.
  const updated = db.transaction((tx) => {
    if (reason) {
      tx.insert(notes)
        .values({
          invoiceId: id,
          userId: session.user.id,
          content: `Cancelled: ${reason}`,
        })
        .run();
    }

    return tx
      .update(invoices)
      .set({
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: session.user.id,
        holdPreviousStatus: null,
        onHoldAt: null,
        onHoldById: null,
        onHoldReason: null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning()
      .get();
  });

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.cancelled",
    details: { reason, previousStatus: invoice.status },
  });

  return NextResponse.json(updated);
}
