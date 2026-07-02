import { NextResponse } from "next/server";
import { pollAllO365Mailboxes } from "@/lib/o365/poll";

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

  const results = await pollAllO365Mailboxes();
  return NextResponse.json({ results });
}

export async function GET(request: Request) {
  return POST(request);
}
