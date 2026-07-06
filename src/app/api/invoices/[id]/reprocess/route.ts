import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isInvoiceLikeAttachment } from "@/lib/attachment-types";
import {
  reprocessDraftInvoice,
  type ReprocessExtraFile,
} from "@/lib/invoice-reprocess";
import { saveBufferToUploads } from "@/lib/uploads";

const SUPPORTED_UPLOAD_EXTENSIONS = [".pdf", ".csv", ".xlsx", ".xls", ".docx"];

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseAttachmentIds(value: FormDataEntryValue | null): string[] | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return undefined;
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let selectedAttachmentIds: string[] | undefined;
  const extraFiles: ReprocessExtraFile[] = [];

  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const formData = await request.formData();
    selectedAttachmentIds = parseAttachmentIds(formData.get("attachmentIds"));

    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      const lowerName = file.name.toLowerCase();
      if (
        !SUPPORTED_UPLOAD_EXTENSIONS.some((extension) =>
          lowerName.endsWith(extension),
        ) ||
        !isInvoiceLikeAttachment(file.name, file.type)
      ) {
        return NextResponse.json(
          { error: "Supported uploads: PDF, CSV, XLSX, XLS, and DOCX" },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const saved = await saveBufferToUploads({
        buffer,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        subdir: "invoices",
      });
      extraFiles.push({
        fileName: file.name,
        filePath: saved.storedPath,
        mimeType: saved.mimeType,
        size: saved.size,
      });
    }
  }

  const { id } = await context.params;
  const result = await reprocessDraftInvoice({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    invoiceId: id,
    selectedAttachmentIds,
    extraFiles,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ invoice: result.invoice, parseError: result.parseError });
}
