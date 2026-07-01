import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getO365Connection, getValidAccessToken } from "@/lib/o365/connection";
import { checkGraphMailboxReadAccess } from "@/lib/o365/graph";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connection = await getO365Connection(session.user.organizationId);
  if (!connection || connection.status !== "CONNECTED") {
    return NextResponse.json({ error: "Office 365 is not connected" }, { status: 400 });
  }

  const url = new URL(request.url);
  const mailboxId = url.searchParams.get("mailboxId")?.trim();
  const mailboxUpn = url.searchParams.get("mailboxUpn")?.trim() ?? "";

  if (!mailboxId) {
    return NextResponse.json({ error: "mailboxId is required" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const result = await checkGraphMailboxReadAccess(accessToken, {
      id: mailboxId,
      displayName: mailboxUpn,
      mail: mailboxUpn,
      userPrincipalName: mailboxUpn,
    });

    if (!result.accessible) {
      return NextResponse.json({
        accessible: false,
        error: result.error,
      });
    }

    return NextResponse.json({ accessible: true });
  } catch (error) {
    return NextResponse.json(
      {
        accessible: false,
        error:
          error instanceof Error ? error.message : "Failed to check mailbox access",
      },
      { status: 502 },
    );
  }
}
