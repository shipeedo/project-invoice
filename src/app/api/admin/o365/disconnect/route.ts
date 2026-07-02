import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { disconnectO365 } from "@/lib/o365/connection";

export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await disconnectO365(session.user.organizationId);
  return NextResponse.json({ status: "DISCONNECTED" });
}
