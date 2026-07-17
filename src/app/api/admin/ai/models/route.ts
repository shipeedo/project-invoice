import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listConnectorModels } from "@/lib/ai-connector";
import { aiConnectorTypes, type AiConnectorType } from "@/lib/db/types";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = new URL(request.url).searchParams.get("type") ?? "AI_GATEWAY";
  if (!aiConnectorTypes.includes(type as AiConnectorType)) {
    return NextResponse.json({ error: "Invalid connector type" }, { status: 400 });
  }

  try {
    const models = await listConnectorModels(type as AiConnectorType);
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list models" },
      { status: 502 },
    );
  }
}
