import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, notes, suppliers } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const createNoteSchema = z.object({
  content: z.string().trim().min(1),
});

type NoteWithUser = {
  id: string;
  content: string;
  createdAt: Date;
  user: { name: string | null; email: string } | null;
};

function serializeNote(note: NoteWithUser) {
  return {
    id: note.id,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    authorName: note.user ? (note.user.name ?? note.user.email) : null,
  };
}

async function findSupplier(id: string, organizationId: string) {
  return db.query.suppliers.findFirst({
    where: and(eq(suppliers.id, id), eq(suppliers.organizationId, organizationId)),
    columns: { id: true },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const supplier = await findSupplier(id, session.user.organizationId);
  if (!supplier) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db.query.notes.findMany({
    where: eq(notes.supplierId, id),
    with: { user: { columns: { name: true, email: true } } },
    orderBy: desc(notes.createdAt),
  });

  return NextResponse.json(rows.map(serializeNote));
}

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

  const supplier = await findSupplier(id, session.user.organizationId);
  if (!supplier) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [note] = await db
    .insert(notes)
    .values({
      supplierId: id,
      userId: session.user.id,
      content: parsed.data.content,
    })
    .returning();

  return NextResponse.json(
    serializeNote({
      ...note,
      user: {
        name: session.user.name ?? null,
        email: session.user.email ?? "",
      },
    }),
    { status: 201 },
  );
}
