import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { auth } from "@/lib/auth";
import { resolveAttachmentContentType } from "@/lib/attachment-types";
import { db, mailboxMessageAttachments } from "@/lib/db";
import { getUploadAbsolutePath } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{ attachmentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attachmentId } = await context.params;

  const attachment = await db.query.mailboxMessageAttachments.findFirst({
    where: eq(mailboxMessageAttachments.id, attachmentId),
    with: {
      message: {
        columns: { organizationId: true },
      },
    },
  });

  if (
    !attachment ||
    attachment.message.organizationId !== session.user.organizationId
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await readFile(getUploadAbsolutePath(attachment.filePath));

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": resolveAttachmentContentType(
        attachment.fileName,
        attachment.mimeType,
      ),
      "Content-Disposition": `inline; filename="${attachment.fileName}"`,
    },
  });
}
