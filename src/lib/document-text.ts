import { readFile } from "fs/promises";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import {
  classifyAttachment,
  type InvoiceAttachmentKind,
} from "@/lib/attachment-types";
import { getUploadAbsolutePath } from "@/lib/uploads";

function isPdfBuffer(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

async function extractPdfText(buffer: Buffer) {
  if (!isPdfBuffer(buffer)) {
    throw new Error("File is not a valid PDF document");
  }

  const pdf = (await import("pdf-parse")).default;
  const parsed = await pdf(buffer);
  return parsed.text.trim();
}

function extractSpreadsheetText(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sections: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (!csv.trim()) continue;
    sections.push(`Sheet: ${sheetName}\n${csv}`);
  }

  return sections.join("\n\n").trim();
}

async function extractDocxText(absolutePath: string) {
  const result = await mammoth.extractRawText({ path: absolutePath });
  return result.value.trim();
}

export async function extractTextFromDocument(
  filePath: string,
  fileName: string,
  mimeType?: string | null,
): Promise<{ text: string; kind: InvoiceAttachmentKind }> {
  const kind = classifyAttachment(fileName, mimeType);
  const absolutePath = getUploadAbsolutePath(filePath);
  const buffer = await readFile(absolutePath);

  switch (kind) {
    case "pdf":
      return { kind, text: await extractPdfText(buffer) };
    case "csv":
      return { kind, text: buffer.toString("utf8").trim() };
    case "xlsx":
    case "xls":
      return { kind, text: extractSpreadsheetText(buffer) };
    case "docx":
      return { kind, text: await extractDocxText(absolutePath) };
    case "doc":
      throw new Error("Legacy .doc files are not supported — save as .docx or PDF");
    default:
      throw new Error(`Unsupported attachment type for ${fileName}`);
  }
}
