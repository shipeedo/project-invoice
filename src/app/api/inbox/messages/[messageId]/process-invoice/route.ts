import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, mailboxMessages } from "@/lib/db";
import { processMailboxMessageInvoice } from "@/lib/o365/process-email";

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

  const outcome = await processMailboxMessageInvoice({
    organizationId: session.user.organizationId,
    messageId,
  });

  if ("error" in outcome && outcome.error) {
    const status = outcome.error.includes("already been created") ? 409 : 400;
    return NextResponse.json(
      {
        error: outcome.error,
        invoiceId: "invoiceId" in outcome ? outcome.invoiceId : undefined,
      },
      { status },
    );
  }

  return NextResponse.json({ invoice: outcome.invoice });
}
