import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pollOrganizationMailbox } from "@/lib/o365/poll";

export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await pollOrganizationMailbox(session.user.organizationId);
  return NextResponse.json(result);
}
