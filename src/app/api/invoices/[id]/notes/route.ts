import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, invoices, notes, users } from "@/lib/db";
import { invoiceNotDeleted } from "@/lib/invoice-trash";
import { extractMentionedUserIds, stripMentionTokens } from "@/lib/mentions";
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

  const [note] = await db
    .insert(notes)
    .values({
      invoiceId: id,
      userId: session.user.id,
      content: parsed.data.content,
    })
    .returning();

  const actorName = session.user.name ?? session.user.email ?? "A colleague";
  const plainContent = stripMentionTokens(parsed.data.content);
  await Promise.all(
    mentionedUsers
      .filter((user) => user.id !== session.user.id)
      .map((user) =>
        createNotification({
          organizationId: session.user.organizationId,
          recipientId: user.id,
          actorId: session.user.id,
          invoiceId: id,
          type: "NOTE_MENTION",
          title: `${actorName} mentioned you in a note`,
          body: `"${plainContent}" — ${invoiceSummaryLine(invoice)}`,
          url: `/invoices/${id}?note=${note.id}`,
          auditAction: "notification.note_mention",
          auditDetails: { noteId: note.id },
        }),
      ),
  );

  return NextResponse.json(note, { status: 201 });
}
