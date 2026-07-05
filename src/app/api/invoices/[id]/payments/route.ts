import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, invoicePayments, invoices } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import {
  PAYABLE_STATUSES,
  outstandingAmount,
  resolvePaymentStatus,
} from "@/lib/invoice-status";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PaymentBody = {
  amount?: number;
  paidAt?: string;
  transactionRef?: string;
  note?: string;
  markAsPaid?: boolean;
};

function parsePaidAt(value: string | undefined): Date | null {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as PaymentBody;

  if (body.amount != null && (!Number.isFinite(body.amount) || body.amount <= 0)) {
    return NextResponse.json(
      { error: "Payment amount must be greater than zero" },
      { status: 400 },
    );
  }

  if (body.amount == null && !body.markAsPaid) {
    return NextResponse.json({ error: "Payment amount is required" }, { status: 400 });
  }

  const paidAt = parsePaidAt(body.paidAt);
  if (!paidAt) {
    return NextResponse.json({ error: "Invalid payment date" }, { status: 400 });
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

  if (!PAYABLE_STATUSES.includes(invoice.status)) {
    return NextResponse.json(
      { error: "Payments can only be recorded on approved invoices" },
      { status: 400 },
    );
  }

  // "Mark as paid" without an explicit amount settles the outstanding balance.
  const paymentAmount =
    body.amount ?? outstandingAmount(invoice.totalAmount, invoice.amountPaid) ?? 0;
  const transactionRef = body.transactionRef?.trim() || null;
  const note = body.note?.trim() || null;

  const newAmountPaid = invoice.amountPaid + paymentAmount;
  const nextStatus = resolvePaymentStatus({
    totalAmount: invoice.totalAmount,
    amountPaid: newAmountPaid,
    markAsPaid: body.markAsPaid,
  });

  // better-sqlite3 transactions must stay synchronous.
  const result = db.transaction((tx) => {
    const payment =
      paymentAmount > 0
        ? tx
            .insert(invoicePayments)
            .values({
              organizationId: session.user.organizationId,
              invoiceId: id,
              amount: paymentAmount,
              paidAt,
              recordedById: session.user.id,
              transactionRef,
              note,
            })
            .returning()
            .get()
        : null;

    const updated = tx
      .update(invoices)
      .set({
        amountPaid: newAmountPaid,
        status: nextStatus,
        paidAt: nextStatus === "PAID" ? paidAt : null,
        markedPaidById: nextStatus === "PAID" ? session.user.id : null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning()
      .get();

    return { payment, invoice: updated };
  });

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: nextStatus === "PAID" ? "invoice.paid" : "invoice.payment_recorded",
    details: {
      amount: paymentAmount,
      paidAt: paidAt.toISOString(),
      transactionRef,
      note,
      amountPaid: newAmountPaid,
      status: nextStatus,
    },
  });

  return NextResponse.json(result);
}
