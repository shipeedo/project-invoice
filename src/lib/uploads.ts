import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "invoices");

export async function saveUploadedFile(file: File) {
  await mkdir(UPLOAD_DIR, { recursive: true });

  const extension = path.extname(file.name) || ".pdf";
  const storedName = `${randomUUID()}${extension}`;
  const storedPath = path.join(UPLOAD_DIR, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(storedPath, buffer);

  return {
    storedPath,
    storedName,
    mimeType: file.type || "application/pdf",
    size: buffer.length,
  };
}

export function getUploadAbsolutePath(storedPath: string) {
  if (path.isAbsolute(storedPath)) {
    return storedPath;
  }
  return path.join(process.cwd(), storedPath);
}
