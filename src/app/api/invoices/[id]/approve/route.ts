import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

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

  const invoice = await db.invoice.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!["PENDING_APPROVAL", "NEEDS_REVIEW"].includes(invoice.status)) {
    return NextResponse.json({ error: "Invoice cannot be approved in its current status" }, { status: 400 });
  }

  const updated = await db.$transaction(async (tx) => {
    if (body.note?.trim()) {
      await tx.note.create({
        data: {
          invoiceId: id,
          userId: session.user.id,
          content: body.note.trim(),
        },
      });
    }

    return tx.invoice.update({
      where: { id },
      data: { status: "APPROVED" },
    });
  });

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.approved",
    details: { note: body.note?.trim() },
  });

  return NextResponse.json(updated);
}
