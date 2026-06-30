import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
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
  const invoice = await db.invoice.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (invoice.status !== "APPROVED") {
    return NextResponse.json({ error: "Only approved invoices can be marked ready for payment" }, { status: 400 });
  }

  const updated = await db.invoice.update({
    where: { id },
    data: { status: "READY_FOR_PAYMENT" },
  });

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.ready_for_payment",
  });

  return NextResponse.json(updated);
}
