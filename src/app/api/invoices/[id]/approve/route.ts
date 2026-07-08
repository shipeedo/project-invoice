import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, invoices, notes } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { APPROVABLE_STATUSES } from "@/lib/invoice-status";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { note?: string };

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
    ),
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!APPROVABLE_STATUSES.includes(invoice.status)) {
    return NextResponse.json(
      { error: "Invoice cannot be approved in its current status" },
      { status: 400 },
    );
  }

  if (!invoice.validatedAt) {
    return NextResponse.json(
      { error: "Invoice must be validated before approval" },
      { status: 400 },
    );
  }

  // better-sqlite3 transactions must stay synchronous.
  const updated = db.transaction((tx) => {
    if (body.note?.trim()) {
      tx.insert(notes)
        .values({
          invoiceId: id,
          userId: session.user.id,
          content: body.note.trim(),
        })
        .run();
    }

    return tx
      .update(invoices)
      .set({
        status: "APPROVED",
        // Approving an unrouted draft assigns it to the approver.
        assignedToId: invoice.assignedToId ?? session.user.id,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning()
      .get();
  });

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.approved",
    details: { note: body.note?.trim() },
  });

  return NextResponse.json(updated);
}
