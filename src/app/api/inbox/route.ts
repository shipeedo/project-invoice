import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, emailThreads } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threads = await db.query.emailThreads.findMany({
    where: eq(emailThreads.organizationId, session.user.organizationId),
    with: {
      supplier: { columns: { id: true, name: true } },
      messages: {
        columns: {
          id: true,
          direction: true,
          fromEmail: true,
          fromName: true,
          bodyText: true,
          receivedAt: true,
        },
        orderBy: (table, { desc: orderDesc }) => [orderDesc(table.receivedAt)],
        limit: 1,
      },
    },
    orderBy: desc(emailThreads.lastMessageAt),
  });

  return NextResponse.json({
    threads: threads.map((thread) => ({
      id: thread.id,
      subject: thread.subject,
      supplier: thread.supplier,
      lastMessageAt: thread.lastMessageAt,
      latestMessage: thread.messages[0]
        ? {
            id: thread.messages[0].id,
            direction: thread.messages[0].direction,
            fromEmail: thread.messages[0].fromEmail,
            fromName: thread.messages[0].fromName,
            preview: thread.messages[0].bodyText?.slice(0, 160) ?? "",
            receivedAt: thread.messages[0].receivedAt,
          }
        : null,
    })),
  });
}
