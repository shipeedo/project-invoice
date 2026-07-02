import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getO365Connection, getValidAccessToken, updateO365Mailbox } from "@/lib/o365/connection";
import { checkGraphMailboxReadAccess } from "@/lib/o365/graph";

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

  const mailboxId = body.mailboxId?.trim();
  if (!mailboxId) {
    return NextResponse.json({ error: "Mailbox id is required" }, { status: 400 });
  }

  const connection = await getO365Connection(session.user.organizationId);
  if (!connection || connection.status !== "CONNECTED") {
    return NextResponse.json({ error: "Office 365 is not connected" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const access = await checkGraphMailboxReadAccess(accessToken, {
      id: mailboxId,
      displayName: mailboxUpn,
      mail: mailboxUpn,
      userPrincipalName: mailboxUpn,
    });

    if (!access.accessible) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not verify mailbox access",
      },
      { status: 400 },
    );
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
