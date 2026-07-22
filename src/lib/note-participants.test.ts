import { beforeEach, describe, expect, it } from "vitest";
import { db, invoices, organizations, users } from "@/lib/db";
import {
  addNoteParticipants,
  listNoteParticipantIds,
  listNoteParticipants,
  participantsJoinedByNote,
  removeNoteParticipant,
} from "@/lib/note-participants";

const ORG = "org-thread";
const OTHER_ORG = "org-outsider";
const KATE = "user-kate";
const ROBERT = "user-robert";
const JAY = "user-jay";
const OUTSIDER = "user-outsider";

let invoiceId: string;

beforeEach(async () => {
  await db.delete(invoices);
  await db.delete(users);
  await db.delete(organizations);

  await db.insert(organizations).values([
    { id: ORG, name: "Shipeedo", slug: "shipeedo-thread" },
    { id: OTHER_ORG, name: "Other", slug: "other-thread" },
  ]);
  await db.insert(users).values([
    { id: KATE, organizationId: ORG, email: "kate@shipeedo.test", name: "Kate Nelson" },
    { id: ROBERT, organizationId: ORG, email: "robert@shipeedo.test", name: "Robert Lynch" },
    { id: JAY, organizationId: ORG, email: "jay@shipeedo.test", name: "Jay Baker" },
    { id: OUTSIDER, organizationId: OTHER_ORG, email: "nope@other.test", name: "Outsider" },
  ]);

  const [invoice] = await db
    .insert(invoices)
    .values({ organizationId: ORG, status: "PENDING_APPROVAL", assignedToId: KATE })
    .returning();
  invoiceId = invoice.id;
});

function add(userIds: string[], addedById: string | null = null) {
  return addNoteParticipants({
    organizationId: ORG,
    invoiceId,
    userIds,
    addedById,
  });
}

describe("addNoteParticipants", () => {
  it("returns only the ids it actually added", async () => {
    expect(await add([KATE, ROBERT])).toEqual([KATE, ROBERT]);
    // Kate is already in, so a re-add is a no-op and must not be notified again.
    expect(await add([KATE, JAY])).toEqual([JAY]);
    expect((await listNoteParticipantIds(invoiceId)).sort()).toEqual(
      [JAY, KATE, ROBERT].sort(),
    );
  });

  it("ignores duplicates within a single call", async () => {
    expect(await add([KATE, KATE])).toEqual([KATE]);
  });

  it("refuses users from another organization", async () => {
    expect(await add([OUTSIDER])).toEqual([]);
    expect(await listNoteParticipantIds(invoiceId)).toEqual([]);
  });

  it("records who did the inviting", async () => {
    await add([ROBERT], KATE);
    const [participant] = await listNoteParticipants(invoiceId);
    expect(participant.addedById).toBe(KATE);
    expect(participant.name).toBe("Robert Lynch");
  });
});

describe("removeNoteParticipant", () => {
  it("removes a member and reports whether there was one", async () => {
    await add([KATE, ROBERT]);
    expect(await removeNoteParticipant({ invoiceId, userId: KATE })).toBe(true);
    expect(await removeNoteParticipant({ invoiceId, userId: KATE })).toBe(false);
    expect(await listNoteParticipantIds(invoiceId)).toEqual([ROBERT]);
  });

  it("lets someone re-join after leaving", async () => {
    await add([KATE]);
    await removeNoteParticipant({ invoiceId, userId: KATE });
    expect(await add([KATE])).toEqual([KATE]);
  });
});

describe("participantsJoinedByNote", () => {
  it("adds the assignee only when starting the thread", () => {
    expect(
      participantsJoinedByNote({
        authorId: ROBERT,
        mentionedUserIds: [],
        assigneeId: KATE,
        threadIsEmpty: true,
      }),
    ).toEqual([ROBERT, KATE]);

    // Once the thread exists, the assignee joins by being mentioned or invited —
    // otherwise someone who left would be pulled back in by the next note.
    expect(
      participantsJoinedByNote({
        authorId: ROBERT,
        mentionedUserIds: [],
        assigneeId: KATE,
        threadIsEmpty: false,
      }),
    ).toEqual([ROBERT]);
  });

  it("includes mentioned users and never repeats anyone", () => {
    expect(
      participantsJoinedByNote({
        authorId: ROBERT,
        mentionedUserIds: [JAY, ROBERT],
        assigneeId: ROBERT,
        threadIsEmpty: true,
      }),
    ).toEqual([ROBERT, JAY]);
  });

  it("copes with an unassigned invoice", () => {
    expect(
      participantsJoinedByNote({
        authorId: ROBERT,
        mentionedUserIds: [],
        assigneeId: null,
        threadIsEmpty: true,
      }),
    ).toEqual([ROBERT]);
  });
});
