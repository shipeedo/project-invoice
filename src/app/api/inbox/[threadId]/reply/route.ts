import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, emailThreads } from "@/lib/db";
import { sendThreadReply } from "@/lib/credit-requests";
import { saveUploadedFile } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;
  const thread = await db.query.emailThreads.findFirst({
    where: and(
      eq(emailThreads.id, threadId),
      eq(emailThreads.organizationId, session.user.organizationId),
    ),
  });

  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const attachmentMeta: Array<{ name: string; path: string; mimeType: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("attachment") && value instanceof File && value.size > 0) {
      const saved = await saveUploadedFile(value);
      attachmentMeta.push({
        name: value.name,
        path: saved.storedPath,
        mimeType: saved.mimeType,
      });
    }
  }

  const outcome = await sendThreadReply({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    threadId,
    message,
    attachments: attachmentMeta,
  });

  if ("error" in outcome && outcome.error) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
