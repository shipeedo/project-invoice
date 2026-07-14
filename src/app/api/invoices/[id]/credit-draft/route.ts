import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { creditDrafts, db, invoices } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { addCreditDocuments } from "@/lib/credit-documents";
import {
  DOCUMENT_UPLOAD_EXTENSIONS,
  hasAllowedExtension,
} from "@/lib/invoice-documents";
import { saveUploadedFile } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
    ),
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const message = String(formData.get("message") ?? "").trim();
  const subject =
    String(formData.get("subject") ?? "").trim() ||
    `Credit request — ${invoice.vendorName ?? invoice.originalFileName ?? "Invoice"}`;

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const attachmentFiles: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("attachment") && value instanceof File && value.size > 0) {
      if (!hasAllowedExtension(value.name, DOCUMENT_UPLOAD_EXTENSIONS)) {
        return NextResponse.json(
          { error: "Supported uploads: PDF, CSV, XLSX, XLS, DOCX, PNG, and JPEG" },
          { status: 400 },
        );
      }
      attachmentFiles.push(value);
    }
  }

  const attachmentMeta: Array<{
    name: string;
    path: string;
    mimeType: string;
    size: number;
  }> = [];
  for (const file of attachmentFiles) {
    const saved = await saveUploadedFile(file);
    attachmentMeta.push({
      name: file.name,
      path: saved.storedPath,
      mimeType: saved.mimeType,
      size: saved.size,
    });
  }

  const [draft] = await db
    .insert(creditDrafts)
    .values({
      invoiceId: id,
      createdById: session.user.id,
      subject,
      message,
      attachments: JSON.stringify(attachmentMeta),
    })
    .returning();

  // Draft attachments still land on the invoice as CREDIT documents even
  // though no credit request row exists yet.
  if (attachmentMeta.length > 0) {
    await addCreditDocuments({
      organizationId: session.user.organizationId,
      invoiceId: id,
      creditRequestId: null,
      uploadedById: session.user.id,
      files: attachmentMeta.map((attachment) => ({
        fileName: attachment.name,
        filePath: attachment.path,
        mimeType: attachment.mimeType,
        size: attachment.size,
      })),
    });
  }

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "credit_draft.created",
    details: { draftId: draft.id, attachmentCount: attachmentMeta.length },
  });

  return NextResponse.json({
    ...draft,
    attachments: attachmentMeta,
    mailto: buildMailtoLink({
      subject,
      message,
      attachments: attachmentMeta,
    }),
  });
}

function buildMailtoLink(params: {
  subject: string;
  message: string;
  attachments: Array<{ name: string }>;
}) {
  const body = [
    params.message,
    "",
    params.attachments.length
      ? `Attachments to include manually:\n${params.attachments.map((file) => `- ${file.name}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const query = new URLSearchParams({
    subject: params.subject,
    body,
  });

  return `mailto:?${query.toString()}`;
}
