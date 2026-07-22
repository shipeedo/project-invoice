import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, invoices, notes, users } from "@/lib/db";
import { invoiceNotDeleted } from "@/lib/invoice-trash";
import { extractMentionedUserIds, stripMentionTokens } from "@/lib/mentions";
import {
  addNoteParticipants,
  listNoteParticipantIds,
  participantsJoinedByNote,
} from "@/lib/note-participants";
import { createNotification, invoiceSummaryLine } from "@/lib/notifications";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const createNoteSchema = z.object({
  content: z.string().trim().min(1),
});

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = createNoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Note content is required" }, { status: 400 });
  }

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
      invoiceNotDeleted(),
    ),
    columns: {
      id: true,
      vendorName: true,
      invoiceNumber: true,
      totalAmount: true,
      currency: true,
      assignedToId: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Mentions arrive as inline `@[Name](userId)` tokens; only keep ones that
  // resolve to a user in the caller's organization.
  const mentionIds = extractMentionedUserIds(parsed.data.content);
  const mentionedUsers =
    mentionIds.length > 0
      ? await db.query.users.findMany({
          where: and(
            inArray(users.id, mentionIds),
            eq(users.organizationId, session.user.organizationId),
          ),
          columns: { id: true },
        })
      : [];

  const participantsBefore = await listNoteParticipantIds(id);

  const [note] = await db
    .insert(notes)
    .values({
      invoiceId: id,
      userId: session.user.id,
      content: parsed.data.content,
    })
    .returning();

  // Posting or being mentioned puts you in the thread, so the next message
  // reaches you without anyone having to remember to tag you again.
  const mentionedIds = mentionedUsers.map((user) => user.id);
  await addNoteParticipants({
    organizationId: session.user.organizationId,
    invoiceId: id,
    userIds: participantsJoinedByNote({
      authorId: session.user.id,
      mentionedUserIds: mentionedIds,
      assigneeId: invoice.assignedToId,
      threadIsEmpty: participantsBefore.length === 0,
    }),
  });

  const actorName = session.user.name ?? session.user.email ?? "A colleague";
  const plainContent = stripMentionTokens(parsed.data.content);
  const mentioned = new Set(mentionedIds);
  const summary = invoiceSummaryLine(invoice);

  // Everyone in the thread hears about the message; being named just changes
  // how loudly. Recipients are resolved after the join above so a first-time
  // mention is notified in the same post that adds them.
  const recipients = (
    await listNoteParticipantIds(id)
  ).filter((userId) => userId !== session.user.id);

  await Promise.all(
    recipients.map((userId) =>
      createNotification({
        organizationId: session.user.organizationId,
        recipientId: userId,
        actorId: session.user.id,
        invoiceId: id,
        type: mentioned.has(userId) ? "NOTE_MENTION" : "NOTE_MESSAGE",
        title: mentioned.has(userId)
          ? `${actorName} mentioned you in a note`
          : `${actorName} posted a note`,
        body: `"${plainContent}" — ${summary}`,
        url: `/invoices/${id}?note=${note.id}`,
        auditAction: mentioned.has(userId)
          ? "notification.note_mention"
          : "notification.note_message",
        auditDetails: { noteId: note.id },
      }),
    ),
  );

  return NextResponse.json(note, { status: 201 });
}
