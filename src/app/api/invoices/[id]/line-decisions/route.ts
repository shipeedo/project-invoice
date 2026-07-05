import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { db, invoices } from "@/lib/db";
import {
  applyLineDecisionUpdates,
  canDecideLineItems,
  deriveInvoiceStatusFromLineItems,
  parseLineItems,
  type LineDecisionUpdate,
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
  const body = (await request.json()) as { decisions?: LineDecisionUpdate[] };

  if (!body.decisions?.length) {
    return NextResponse.json({ error: "No decisions provided" }, { status: 400 });
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

  const lineItems = parseLineItems(invoice.lineItems);
  if (
    !canDecideLineItems({
      status: invoice.status,
      validatedAt: invoice.validatedAt,
      lineItemCount: lineItems.length,
    })
  ) {
    return NextResponse.json(
      { error: "Line items cannot be approved or rejected in the invoice's current state" },
      { status: 400 },
    );
  }

  const updatedLineItems = applyLineDecisionUpdates(lineItems, body.decisions);
  const nextStatus = deriveInvoiceStatusFromLineItems(updatedLineItems, invoice.status);

  const [updated] = await db
    .update(invoices)
    .set({
      lineItems: JSON.stringify(updatedLineItems),
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, id))
    .returning();

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.line_decisions_updated",
    details: {
      decisions: body.decisions.map((decision) => ({
        ...decision,
        lineNumber:
          lineItems[decision.lineIndex]?.lineNumber ?? decision.lineIndex + 1,
        description: lineItems[decision.lineIndex]?.description ?? null,
        amount: lineItems[decision.lineIndex]?.amount ?? null,
      })),
      status: nextStatus,
    },
  });

  return NextResponse.json({
    lineItems: updatedLineItems,
    status: updated.status,
    updatedAt: updated.updatedAt,
  });
}
