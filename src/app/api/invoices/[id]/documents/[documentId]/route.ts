import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { auth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { resolveAttachmentContentType } from "@/lib/attachment-types";
import { db, invoiceDocuments } from "@/lib/db";
import { getUploadAbsolutePath } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{ id: string; documentId: string }>;
};

async function findDocument(params: {
  documentId: string;
  invoiceId: string;
  organizationId: string;
}) {
  return db.query.invoiceDocuments.findFirst({
    where: and(
      eq(invoiceDocuments.id, params.documentId),
      eq(invoiceDocuments.invoiceId, params.invoiceId),
      eq(invoiceDocuments.organizationId, params.organizationId),
    ),
  });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, documentId } = await context.params;
  const document = await findDocument({
    documentId,
    invoiceId: id,
    organizationId: session.user.organizationId,
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const absolutePath = getUploadAbsolutePath(document.filePath);
  const buffer = await readFile(absolutePath);
  const download =
    new URL(request.url).searchParams.get("download") === "1";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": resolveAttachmentContentType(
        document.fileName,
        document.mimeType,
      ),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${document.fileName}"`,
    },
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, documentId } = await context.params;
  const document = await findDocument({
    documentId,
    invoiceId: id,
    organizationId: session.user.organizationId,
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Rebill and credit documents are part of a record and cannot be removed.
  if (document.kind !== "GENERAL") {
    return NextResponse.json(
      { error: "Only general documents can be removed" },
      { status: 400 },
    );
  }

  await db.delete(invoiceDocuments).where(eq(invoiceDocuments.id, document.id));

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.document_removed",
    details: { fileName: document.fileName, kind: document.kind },
  });

  return NextResponse.json({ ok: true });
}
