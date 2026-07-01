import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getO365Connection, getValidAccessToken } from "@/lib/o365/connection";
import { listGraphMailboxes } from "@/lib/o365/graph";

export async function GET() {
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

  try {
    const accessToken = await getValidAccessToken(connection);
    const mailboxes = await listGraphMailboxes(accessToken);
    return NextResponse.json({ mailboxes });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list mailboxes",
      },
      { status: 502 },
    );
  }
}
