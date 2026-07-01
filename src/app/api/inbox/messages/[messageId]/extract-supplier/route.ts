import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, mailboxMessages } from "@/lib/db";
import { extractSupplierFromEmail } from "@/lib/supplier-from-email-extraction";

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

  const extraction = await extractSupplierFromEmail(message);

  if (!extraction.data) {
    return NextResponse.json(
      { error: extraction.error ?? "Extraction failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ extracted: extraction.data });
}
