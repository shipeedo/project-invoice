import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAndSendCreditRequest } from "@/lib/credit-requests";
import { creditRequests, db, invoices } from "@/lib/db";
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
    with: { supplier: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const message = String(formData.get("message") ?? "").trim();
  const subject =
    String(formData.get("subject") ?? "").trim() ||
    `Credit request — ${invoice.vendorName ?? invoice.originalFileName ?? "Invoice"}`;
  const recipientEmail =
    String(formData.get("recipientEmail") ?? "").trim() ||
    invoice.vendorEmail ||
    invoice.emailFrom ||
    "";

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  if (!recipientEmail) {
    return NextResponse.json(
      { error: "Recipient email is required" },
      { status: 400 },
    );
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

  const outcome = await createAndSendCreditRequest({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    invoiceId: id,
    subject,
    message,
    recipientEmail,
    attachments: attachmentMeta,
  });

  if ("error" in outcome && outcome.error) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  return NextResponse.json(outcome.creditRequest, { status: 201 });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const requests = await db.query.creditRequests.findMany({
    where: and(
      eq(creditRequests.invoiceId, id),
      eq(creditRequests.organizationId, session.user.organizationId),
    ),
    with: {
      thread: true,
      createdBy: { columns: { id: true, name: true, email: true } },
    },
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return NextResponse.json({ creditRequests: requests });
}
