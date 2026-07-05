import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { db, invoices } from "@/lib/db";
import { isExtractionPending } from "@/lib/invoice-status";
import {
  applyLineEditUpdates,
  parseLineItemEditUpdates,
  parseLineItems,
} from "@/lib/line-items";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { edits?: unknown };

  const edits = parseLineItemEditUpdates(body.edits);
  if (!edits) {
    return NextResponse.json({ error: "Invalid edits provided" }, { status: 400 });
  }

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
    ),
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isExtractionPending(invoice)) {
    return NextResponse.json(
      { error: "Line items cannot be edited while the invoice is processing" },
      { status: 400 },
    );
  }

  if (["PAID", "CANCELLED"].includes(invoice.status)) {
    return NextResponse.json(
      { error: "Line items cannot be edited once the invoice is closed" },
      { status: 400 },
    );
  }

  const lineItems = parseLineItems(invoice.lineItems);
  if (lineItems.length === 0) {
    return NextResponse.json({ error: "Invoice has no line items" }, { status: 400 });
  }

  if (edits.some((edit) => edit.lineIndex >= lineItems.length)) {
    return NextResponse.json({ error: "Invalid line index" }, { status: 400 });
  }

  const updatedLineItems = applyLineEditUpdates(lineItems, edits);

  const [updated] = await db
    .update(invoices)
    .set({
      lineItems: JSON.stringify(updatedLineItems),
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, id))
    .returning();

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.line_items_edited",
    details: { edits },
  });

  return NextResponse.json({
    lineItems: updatedLineItems,
    updatedAt: updated.updatedAt,
  });
}
