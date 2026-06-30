import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupplierFromMessage } from "@/lib/credit-requests";
import { db, mailboxMessages } from "@/lib/db";

type RouteContext = {
  params: Promise<{ messageId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await context.params;
  const body = (await request.json()) as { name?: string };

  const message = await db.query.mailboxMessages.findFirst({
    where: and(
      eq(mailboxMessages.id, messageId),
      eq(mailboxMessages.organizationId, session.user.organizationId),
    ),
  });

  if (!message) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const outcome = await createSupplierFromMessage({
    organizationId: session.user.organizationId,
    messageId,
    name: body.name,
  });

  if ("error" in outcome && outcome.error) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  return NextResponse.json({
    supplier: outcome.supplier,
    existing: outcome.existing,
  });
}
