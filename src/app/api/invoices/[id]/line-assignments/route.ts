import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { db, invoices, users } from "@/lib/db";
import { isExtractionPending } from "@/lib/invoice-status";
import {
  applyLineAssignmentUpdates,
  parseLineItems,
  type LineAssignmentUpdate,
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
  const body = (await request.json()) as { assignments?: LineAssignmentUpdate[] };

  if (!body.assignments?.length) {
    return NextResponse.json({ error: "No assignments provided" }, { status: 400 });
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
      { error: "Line assignments cannot be changed while the invoice is processing" },
      { status: 400 },
    );
  }

  if (invoice.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Line assignments cannot be changed once the invoice is closed" },
      { status: 400 },
    );
  }

  const lineItems = parseLineItems(invoice.lineItems);
  if (lineItems.length === 0) {
    return NextResponse.json({ error: "Invoice has no line items" }, { status: 400 });
  }

  const assigneeIds = [
    ...new Set(
      body.assignments
        .map((assignment) => assignment.assignedToId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  if (assigneeIds.length > 0) {
    const validUsers = await db.query.users.findMany({
      where: and(
        eq(users.organizationId, session.user.organizationId),
        inArray(users.id, assigneeIds),
      ),
      columns: { id: true },
    });

    if (validUsers.length !== assigneeIds.length) {
      return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
    }
  }

  const updatedLineItems = applyLineAssignmentUpdates(lineItems, body.assignments);

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
    action: "invoice.line_assignments_updated",
    details: { assignments: body.assignments },
  });

  return NextResponse.json({
    lineItems: updatedLineItems,
    updatedAt: updated.updatedAt,
  });
}
