import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, invoices } from "@/lib/db";
import { saveUploadedFile } from "@/lib/uploads";
import { processUploadedInvoice } from "@/lib/invoices";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.query.invoices.findMany({
    where: eq(invoices.organizationId, session.user.organizationId),
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
    return NextResponse.json({ error: "PDF file is required" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only PDF uploads are supported in the pilot" },
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
