import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getO365Connection, getValidAccessToken, updateO365Mailbox } from "@/lib/o365/connection";
import { resolveGraphMailboxByAddress } from "@/lib/o365/graph";

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

  const mailboxUpn = body.mailboxUpn?.trim();
  if (!mailboxUpn) {
    return NextResponse.json(
      { error: "Mailbox email address is required" },
      { status: 400 },
    );
  }

  const connection = await getO365Connection(session.user.organizationId);
  if (!connection || connection.status !== "CONNECTED") {
    return NextResponse.json({ error: "Office 365 is not connected" }, { status: 400 });
  }

  let mailboxId = body.mailboxId?.trim() ?? null;
  if (!mailboxId) {
    try {
      const accessToken = await getValidAccessToken(connection);
      const resolved = await resolveGraphMailboxByAddress(accessToken, mailboxUpn);
      mailboxId = resolved.id;
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not resolve mailbox address",
        },
        { status: 400 },
      );
    }
  }

  const updated = await updateO365Mailbox({
    organizationId: session.user.organizationId,
    mailboxId,
    mailboxUpn,
  });

  return NextResponse.json({
    mailboxId: updated?.selectedMailboxId ?? null,
    mailboxUpn: updated?.selectedMailboxUpn ?? null,
  });
}
