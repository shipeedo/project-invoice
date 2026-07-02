import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getO365Connection } from "@/lib/o365/connection";
import { isO365Configured } from "@/lib/o365/config";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connection = await getO365Connection(session.user.organizationId);

  return NextResponse.json({
    configured: isO365Configured(),
    status: connection?.status ?? "DISCONNECTED",
    mailboxUpn: connection?.selectedMailboxUpn ?? null,
    mailboxId: connection?.selectedMailboxId ?? null,
    connectedAt: connection?.connectedAt ?? null,
    lastSyncedAt: connection?.lastSyncedAt ?? null,
    lastError: connection?.lastError ?? null,
    microsoftTenantId: connection?.microsoftTenantId ?? null,
  });
}
