import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { retryProcessingJob } from "@/lib/processing-queue";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const outcome = await retryProcessingJob({
    organizationId: session.user.organizationId,
    jobId: id,
  });

  if ("error" in outcome) {
    const status = outcome.error === "Job not found" ? 404 : 400;
    return NextResponse.json({ error: outcome.error }, { status });
  }

  return NextResponse.json(outcome);
}
