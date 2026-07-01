import { NextResponse } from "next/server";
import { processAllEscalations } from "@/lib/escalation";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processAllEscalations();
  return NextResponse.json({ ok: true, ...result });
}
