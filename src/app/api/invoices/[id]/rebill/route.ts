import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { db, invoiceDocuments, invoices, notes, rebills } from "@/lib/db";
import {
  REBILL_UPLOAD_EXTENSIONS,
  hasAllowedExtension,
} from "@/lib/invoice-documents";
import { invoiceNotDeleted } from "@/lib/invoice-trash";
import { saveUploadedFile } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const formData = await request.formData();

  const customerNameValue = formData.get("customerName");
  const customerName =
    typeof customerNameValue === "string" ? customerNameValue.trim() : "";
  if (!customerName) {
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  }

  const referenceValue = formData.get("reference");
  const reference =
    typeof referenceValue === "string" ? referenceValue.trim() || null : null;

  const noteValue = formData.get("note");
  const noteContent = typeof noteValue === "string" ? noteValue.trim() : "";

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "At least one document is required" },
      { status: 400 },
    );
  }

  for (const file of files) {
    if (!hasAllowedExtension(file.name, REBILL_UPLOAD_EXTENSIONS)) {
      return NextResponse.json(
        { error: "Supported uploads: PDF, CSV, XLSX, and XLS" },
        { status: 400 },
      );
    }
  }

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
      invoiceNotDeleted(),
    ),
    columns: { id: true, status: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Cancelled invoices cannot be rebilled" },
      { status: 400 },
    );
  }

  const [rebill] = await db
    .insert(rebills)
    .values({
      organizationId: session.user.organizationId,
      invoiceId: id,
      customerName,
      reference,
      createdById: session.user.id,
    })
    .returning();

  const created = [];
  for (const file of files) {
    const saved = await saveUploadedFile(file);
    const [document] = await db
      .insert(invoiceDocuments)
      .values({
        organizationId: session.user.organizationId,
        invoiceId: id,
        rebillId: rebill.id,
        uploadedById: session.user.id,
        fileName: file.name,
        filePath: saved.storedPath,
        mimeType: saved.mimeType,
        size: saved.size,
        kind: "REBILL",
      })
      .returning();
    created.push(document);
  }

  if (noteContent) {
    await db.insert(notes).values({
      invoiceId: id,
      documentId: created[0].id,
      userId: session.user.id,
      content: noteContent,
    });
  }

  await recordAuditEvent({
    invoiceId: id,
    userId: session.user.id,
    action: "invoice.rebilled",
    details: {
      customerName,
      reference,
      fileNames: created.map((document) => document.fileName),
    },
  });

  return NextResponse.json(rebill, { status: 201 });
}
