import { and, eq, inArray } from "drizzle-orm";
import { db, noteParticipants, users } from "@/lib/db";

export type NoteParticipant = {
  userId: string;
  name: string | null;
  email: string;
  addedById: string | null;
  createdAt: Date;
};

/** Everyone currently in an invoice's note thread, oldest membership first. */
export async function listNoteParticipants(
  invoiceId: string,
): Promise<NoteParticipant[]> {
  const rows = await db.query.noteParticipants.findMany({
    where: eq(noteParticipants.invoiceId, invoiceId),
    with: { user: { columns: { id: true, name: true, email: true } } },
  });

  return rows
    .filter((row) => row.user != null)
    .map((row) => ({
      userId: row.userId,
      name: row.user!.name,
      email: row.user!.email,
      addedById: row.addedById,
      createdAt: row.createdAt,
    }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function listNoteParticipantIds(invoiceId: string): Promise<string[]> {
  const rows = await db.query.noteParticipants.findMany({
    where: eq(noteParticipants.invoiceId, invoiceId),
    columns: { userId: true },
  });
  return rows.map((row) => row.userId);
}

/**
 * Adds users to a thread, ignoring anyone already in it, and returns the ids
 * actually added so callers only notify people for whom this is news.
 *
 * Membership is deliberately not restored implicitly: `userIds` must be an
 * intentional set (author, mentions, invitees), never "everyone who could be
 * interested", or leaving the thread would not stick.
 */
export async function addNoteParticipants(params: {
  organizationId: string;
  invoiceId: string;
  userIds: string[];
  addedById?: string | null;
}): Promise<string[]> {
  const wanted = [...new Set(params.userIds)];
  if (wanted.length === 0) return [];

  // Only real users of this organization can join a thread.
  const eligible = await db.query.users.findMany({
    where: and(
      inArray(users.id, wanted),
      eq(users.organizationId, params.organizationId),
    ),
    columns: { id: true },
  });
  if (eligible.length === 0) return [];

  const existing = new Set(await listNoteParticipantIds(params.invoiceId));
  const toAdd = eligible.map((user) => user.id).filter((id) => !existing.has(id));
  if (toAdd.length === 0) return [];

  await db.insert(noteParticipants).values(
    toAdd.map((userId) => ({
      organizationId: params.organizationId,
      invoiceId: params.invoiceId,
      userId,
      addedById: params.addedById ?? null,
    })),
  );

  return toAdd;
}

export async function removeNoteParticipant(params: {
  invoiceId: string;
  userId: string;
}): Promise<boolean> {
  const removed = await db
    .delete(noteParticipants)
    .where(
      and(
        eq(noteParticipants.invoiceId, params.invoiceId),
        eq(noteParticipants.userId, params.userId),
      ),
    )
    .returning({ userId: noteParticipants.userId });

  return removed.length > 0;
}

/**
 * Works out who joins the thread as a side effect of a note being posted: the
 * author and everyone they mentioned, plus the invoice's assignee when this is
 * the first note (so the person responsible for the invoice starts in the
 * thread without having to be invited).
 */
export function participantsJoinedByNote(params: {
  authorId: string;
  mentionedUserIds: string[];
  assigneeId: string | null;
  threadIsEmpty: boolean;
}): string[] {
  const joining = [params.authorId, ...params.mentionedUserIds];
  if (params.threadIsEmpty && params.assigneeId) {
    joining.push(params.assigneeId);
  }
  return [...new Set(joining)];
}
