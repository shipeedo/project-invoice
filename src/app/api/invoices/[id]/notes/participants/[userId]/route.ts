import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, invoices } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { invoiceNotDeleted } from "@/lib/invoice-trash";
import {
  listNoteParticipants,
  removeNoteParticipant,
} from "@/lib/note-participants";

type RouteContext = {
  params: Promise<{ id: string; userId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, userId } = await context.params;

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
      invoiceNotDeleted(),
    ),
    columns: { id: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const removed = await removeNoteParticipant({ invoiceId: id, userId });
  if (!removed) {
    return NextResponse.json({ error: "Not in this thread" }, { status: 404 });
  }

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    // Leaving and being removed are the same operation from the thread's point
    // of view, but not from an audit reader's.
    action:
      userId === session.user.id
        ? "note_thread.left"
        : "note_thread.participant_removed",
    details: { participantId: userId },
  });

  return NextResponse.json({ participants: await listNoteParticipants(id) });
}
