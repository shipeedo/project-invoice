import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, invoices } from "@/lib/db";
import { invoiceNotDeleted } from "@/lib/invoice-trash";
import {
  addNoteParticipants,
  listNoteParticipants,
} from "@/lib/note-participants";
import { createNotification, invoiceSummaryLine } from "@/lib/notifications";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const addParticipantsSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
});

async function findInvoice(id: string, organizationId: string) {
  return db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, organizationId),
      invoiceNotDeleted(),
    ),
    columns: {
      id: true,
      vendorName: true,
      invoiceNumber: true,
      totalAmount: true,
      currency: true,
    },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const invoice = await findInvoice(id, session.user.organizationId);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ participants: await listNoteParticipants(id) });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = addParticipantsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose at least one person to add" },
      { status: 400 },
    );
  }

  const invoice = await findInvoice(id, session.user.organizationId);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const added = await addNoteParticipants({
    organizationId: session.user.organizationId,
    invoiceId: id,
    userIds: parsed.data.userIds,
    addedById: session.user.id,
  });

  const actorName = session.user.name ?? session.user.email ?? "A colleague";
  await Promise.all(
    added
      .filter((userId) => userId !== session.user.id)
      .map((userId) =>
        createNotification({
          organizationId: session.user.organizationId,
          recipientId: userId,
          actorId: session.user.id,
          invoiceId: id,
          type: "NOTE_PARTICIPANT_ADDED",
          title: `${actorName} added you to a note thread`,
          body: invoiceSummaryLine(invoice),
          url: `/invoices/${id}`,
          auditAction: "notification.note_participant_added",
        }),
      ),
  );

  return NextResponse.json({ participants: await listNoteParticipants(id) });
}
