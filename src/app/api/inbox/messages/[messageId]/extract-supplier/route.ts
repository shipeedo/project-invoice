import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, mailboxMessages } from "@/lib/db";
import { extractSupplierFromEmailThread } from "@/lib/supplier-from-email-extraction";

type RouteContext = {
  params: Promise<{ messageId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await context.params;

  const message = await db.query.mailboxMessages.findFirst({
    where: and(
      eq(mailboxMessages.id, messageId),
      eq(mailboxMessages.organizationId, session.user.organizationId),
    ),
  });

  if (!message) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const threadMessages = await db.query.mailboxMessages.findMany({
    where: and(
      eq(mailboxMessages.threadId, message.threadId),
      eq(mailboxMessages.organizationId, session.user.organizationId),
    ),
    orderBy: asc(mailboxMessages.receivedAt),
  });

  const extraction = await extractSupplierFromEmailThread({
    organizationId: session.user.organizationId,
    messages: threadMessages,
    focusMessageId: message.id,
  });

  if (!extraction.data) {
    return NextResponse.json(
      { error: extraction.error ?? "Extraction failed" },
      { status: 502 },
    );
  }

  const { candidates, recommendedIndex } = extraction.data;
  const recommended = candidates[recommendedIndex] ?? candidates[0];

  return NextResponse.json({
    candidates,
    recommendedIndex,
    extracted: {
      company: recommended.company,
      senderEmail: recommended.senderEmail,
      contactName: recommended.contactName,
      domain: recommended.domain,
    },
  });
}
