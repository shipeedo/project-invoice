import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refreshAiCredits } from "@/lib/ai-connector";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const balance = await refreshAiCredits(session.user.organizationId);
  if (balance == null) {
    return NextResponse.json(
      { error: "Unable to fetch AI provider credits" },
      { status: 502 },
    );
  }
  return NextResponse.json({ balance });
}
