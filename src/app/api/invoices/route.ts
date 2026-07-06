import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isInvoiceLikeAttachment } from "@/lib/attachment-types";
import { db, invoices } from "@/lib/db";
import { invoiceNotDeleted } from "@/lib/invoice-trash";
import { saveUploadedFile } from "@/lib/uploads";
import { processUploadedInvoice } from "@/lib/invoices";

const SUPPORTED_UPLOAD_EXTENSIONS = [".pdf", ".csv", ".xlsx", ".xls", ".docx"];

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.query.invoices.findMany({
    where: and(
      eq(invoices.organizationId, session.user.organizationId),
      invoiceNotDeleted(),
    ),
    with: {
      assignedTo: {
        columns: { id: true, name: true, email: true },
      },
    },
    orderBy: desc(invoices.createdAt),
  });

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Invoice file is required" }, { status: 400 });
  }

  const lowerName = file.name.toLowerCase();
  if (
    !SUPPORTED_UPLOAD_EXTENSIONS.some((extension) => lowerName.endsWith(extension)) ||
    !isInvoiceLikeAttachment(file.name, file.type)
  ) {
    return NextResponse.json(
      { error: "Supported uploads: PDF, CSV, XLSX, XLS, and DOCX" },
      { status: 400 },
    );
  }

  const saved = await saveUploadedFile(file);
  const invoice = await processUploadedInvoice({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    filePath: saved.storedPath,
    fileName: file.name,
    mimeType: saved.mimeType,
  });

  return NextResponse.json(invoice, { status: 201 });
}
