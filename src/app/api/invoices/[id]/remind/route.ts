import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, invoices, notifications, users } from "@/lib/db";
import { createNotification, invoiceSummaryLine } from "@/lib/notifications";

const REMINDER_THROTTLE_MS = 5 * 60 * 1000;

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_NOTE_LENGTH = 500;

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { note?: string };
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Note must be ${MAX_NOTE_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
      isNull(invoices.deletedAt),
    ),
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!invoice.assignedToId) {
    return NextResponse.json(
      { error: "Invoice has no assignee to remind" },
      { status: 400 },
    );
  }

  const assignee = await db.query.users.findFirst({
    where: eq(users.id, invoice.assignedToId),
  });
  if (!assignee) {
    return NextResponse.json(
      { error: "Assignee no longer exists" },
      { status: 400 },
    );
  }

  const recentReminder = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.invoiceId, id),
      eq(notifications.recipientId, assignee.id),
      eq(notifications.type, "INVOICE_REMINDER"),
      gt(notifications.createdAt, new Date(Date.now() - REMINDER_THROTTLE_MS)),
    ),
  });
  if (recentReminder) {
    return NextResponse.json(
      { error: "A reminder was sent moments ago" },
      { status: 429 },
    );
  }

  await createNotification({
    organizationId: session.user.organizationId,
    recipientId: assignee.id,
    actorId: session.user.id,
    invoiceId: id,
    type: "INVOICE_REMINDER",
    title: `Reminder from ${session.user.name ?? session.user.email ?? "a colleague"}`,
    body: note
      ? `"${note}" — ${invoiceSummaryLine(invoice)}`
      : `This invoice needs your attention: ${invoiceSummaryLine(invoice)}`,
    auditAction: "notification.reminder_sent",
    auditDetails: { recipientEmail: assignee.email, note: note || undefined },
  });

  return NextResponse.json({ ok: true });
}
