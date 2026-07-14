import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, invoices, mailboxMessages } from "@/lib/db";
import { extractSupplierFromEmailThread } from "@/lib/supplier-from-email-extraction";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
    ),
    columns: { id: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sourceMessage = await db.query.mailboxMessages.findFirst({
    where: and(
      eq(mailboxMessages.invoiceId, invoice.id),
      eq(mailboxMessages.organizationId, session.user.organizationId),
    ),
  });

  if (!sourceMessage) {
    return NextResponse.json(
      { error: "This invoice has no source email to read." },
      { status: 400 },
    );
  }

  const threadMessages = await db.query.mailboxMessages.findMany({
    where: and(
      eq(mailboxMessages.threadId, sourceMessage.threadId),
      eq(mailboxMessages.organizationId, session.user.organizationId),
    ),
    orderBy: asc(mailboxMessages.receivedAt),
  });

  const extraction = await extractSupplierFromEmailThread({
    organizationId: session.user.organizationId,
    messages: threadMessages,
    focusMessageId: sourceMessage.id,
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
