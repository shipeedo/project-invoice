import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { readSpreadsheetPreview } from "@/lib/attachment-preview";
import { db, invoiceAttachments, invoiceDocuments, invoices } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Exactly one source per request: an uploaded document, a source email
// attachment, or the invoice's primary file.
const querySchema = z.union([
  z.object({ documentId: z.string().min(1) }),
  z.object({ attachmentId: z.string().min(1) }),
  z.object({ file: z.literal("1") }),
]);

/**
 * Returns a bounded JSON grid for CSV/XLSX/XLS files so the client-side file
 * viewer can render spreadsheets without downloading them. `preview` is null
 * when the target file is not a spreadsheet or cannot be parsed.
 */
export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide documentId, attachmentId, or file=1" },
      { status: 400 },
    );
  }

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
    ),
    columns: {
      id: true,
      filePath: true,
      fileMimeType: true,
      originalFileName: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  let target: {
    filePath: string;
    fileName: string;
    mimeType: string | null;
  } | null = null;

  if ("documentId" in parsed.data) {
    const document = await db.query.invoiceDocuments.findFirst({
      where: and(
        eq(invoiceDocuments.id, parsed.data.documentId),
        eq(invoiceDocuments.invoiceId, id),
        eq(invoiceDocuments.organizationId, session.user.organizationId),
      ),
      columns: { filePath: true, fileName: true, mimeType: true },
    });
    if (document) target = document;
  } else if ("attachmentId" in parsed.data) {
    const attachment = await db.query.invoiceAttachments.findFirst({
      where: and(
        eq(invoiceAttachments.id, parsed.data.attachmentId),
        eq(invoiceAttachments.invoiceId, id),
      ),
      columns: { filePath: true, fileName: true, mimeType: true },
    });
    if (attachment) target = attachment;
  } else if (invoice.filePath) {
    target = {
      filePath: invoice.filePath,
      fileName: invoice.originalFileName ?? "invoice.pdf",
      mimeType: invoice.fileMimeType,
    };
  }

  if (!target) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const preview = await readSpreadsheetPreview(
    target.filePath,
    target.fileName,
    target.mimeType,
  );

  return NextResponse.json({ preview });
}
