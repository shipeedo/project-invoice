import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { auth } from "@/lib/auth";
import { resolveAttachmentContentType } from "@/lib/attachment-types";
import { db, invoiceAttachments, invoices } from "@/lib/db";
import { getUploadAbsolutePath } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{ id: string; attachmentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, attachmentId } = await context.params;

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
    ),
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const attachment = await db.query.invoiceAttachments.findFirst({
    where: and(
      eq(invoiceAttachments.id, attachmentId),
      eq(invoiceAttachments.invoiceId, id),
    ),
  });

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const absolutePath = getUploadAbsolutePath(attachment.filePath);
  const buffer = await readFile(absolutePath);
  const download =
    new URL(request.url).searchParams.get("download") === "1";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": resolveAttachmentContentType(
        attachment.fileName,
        attachment.mimeType,
      ),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${attachment.fileName}"`,
    },
  });
}
