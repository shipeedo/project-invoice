import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, emailThreads } from "@/lib/db";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;

  const thread = await db.query.emailThreads.findFirst({
    where: and(
      eq(emailThreads.id, threadId),
      eq(emailThreads.organizationId, session.user.organizationId),
    ),
    with: {
      supplier: { columns: { id: true, name: true } },
      messages: {
        with: {
          attachments: true,
          sentBy: { columns: { id: true, name: true, email: true } },
          invoice: {
            columns: { id: true, vendorName: true, originalFileName: true },
          },
        },
        orderBy: (messages, { asc: orderAsc }) => [orderAsc(messages.receivedAt)],
      },
      creditRequests: {
        with: {
          createdBy: { columns: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ thread });
}
