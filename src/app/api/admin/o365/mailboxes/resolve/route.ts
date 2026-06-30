import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getO365Connection, getValidAccessToken } from "@/lib/o365/connection";
import { resolveGraphMailboxByAddress } from "@/lib/o365/graph";

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

  const address = new URL(request.url).searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const mailbox = await resolveGraphMailboxByAddress(accessToken, address);
    return NextResponse.json({ mailbox });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not find a mailbox with that address",
      },
      { status: 404 },
    );
  }
}
