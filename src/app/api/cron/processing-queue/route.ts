import { NextResponse } from "next/server";
import { runProcessingQueue } from "@/lib/processing-queue";

function isAuthorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV === "development";
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runProcessingQueue();
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return POST(request);
}
