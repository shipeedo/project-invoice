import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, invoices } from "@/lib/db";
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

  if (invoice.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Only approved invoices can be marked ready for payment" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(invoices)
    .set({ status: "READY_FOR_PAYMENT", updatedAt: new Date() })
    .where(eq(invoices.id, id))
    .returning();

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.ready_for_payment",
  });

  return NextResponse.json(updated);
}
