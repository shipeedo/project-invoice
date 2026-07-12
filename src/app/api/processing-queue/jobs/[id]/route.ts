import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, processingJobs } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await db.query.processingJobs.findFirst({
    where: and(
      eq(processingJobs.id, id),
      eq(processingJobs.organizationId, session.user.organizationId),
    ),
    with: {
      message: {
        with: {
          attachments: {
            columns: { id: true, fileName: true, isInline: true, contentId: true },
          },
        },
      },
    },
  });

  if (!job || !job.message) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    job: {
      id: job.id,
      status: job.status,
      outcome: job.outcome,
      lastError: job.lastError,
      attempts: job.attempts,
      invoiceId: job.invoiceId,
      createdAt: job.createdAt.toISOString(),
      finishedAt: job.finishedAt?.toISOString() ?? null,
    },
    email: {
      subject: job.message.subject,
      fromName: job.message.fromName,
      fromEmail: job.message.fromEmail,
      toEmails: parseEmailList(job.message.toEmails),
      ccEmails: parseEmailList(job.message.ccEmails),
      receivedAt: job.message.receivedAt?.toISOString() ?? null,
      bodyHtml: job.message.bodyHtml,
      bodyText: job.message.bodyText,
      threadId: job.message.threadId,
      attachments: job.message.attachments,
    },
  });
}
