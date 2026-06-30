import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getO365Connection, updateO365Mailbox } from "@/lib/o365/connection";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    mailboxId?: string;
    mailboxUpn?: string;
  };

  if (!body.mailboxId?.trim() || !body.mailboxUpn?.trim()) {
    return NextResponse.json(
      { error: "mailboxId and mailboxUpn are required" },
      { status: 400 },
    );
  }

  const connection = await getO365Connection(session.user.organizationId);
  if (!connection || connection.status !== "CONNECTED") {
    return NextResponse.json({ error: "Office 365 is not connected" }, { status: 400 });
  }

  const updated = await updateO365Mailbox({
    organizationId: session.user.organizationId,
    mailboxId: body.mailboxId.trim(),
    mailboxUpn: body.mailboxUpn.trim(),
  });

  return NextResponse.json({
    mailboxId: updated?.selectedMailboxId ?? null,
    mailboxUpn: updated?.selectedMailboxUpn ?? null,
  });
}
