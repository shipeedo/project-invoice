import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runProcessingQueue } from "@/lib/processing-queue";

export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runProcessingQueue();
  return NextResponse.json(result);
}
