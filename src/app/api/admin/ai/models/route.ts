import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listGatewayModels } from "@/lib/ai-connector";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const models = await listGatewayModels();
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list models" },
      { status: 502 },
    );
  }
}
