import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// Stored paths are RELATIVE to the project root (e.g. "uploads/email/x.pdf")
// so the database stays portable across machines and project moves. Use
// getUploadAbsolutePath to resolve them for filesystem access.
const UPLOAD_SUBDIRS = {
  invoices: path.join("uploads", "invoices"),
  email: path.join("uploads", "email"),
} as const;

export async function saveUploadedFile(file: File) {
  const relativeDir = UPLOAD_SUBDIRS.invoices;
  await mkdir(path.join(process.cwd(), relativeDir), { recursive: true });

  const extension = path.extname(file.name) || ".pdf";
  const storedName = `${randomUUID()}${extension}`;
  const storedPath = path.join(relativeDir, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(path.join(process.cwd(), storedPath), buffer);

  return {
    storedPath,
    storedName,
    mimeType: file.type || "application/pdf",
    size: buffer.length,
  };
}

export async function saveBufferToUploads(params: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  subdir?: "invoices" | "email";
}) {
  const relativeDir = UPLOAD_SUBDIRS[params.subdir ?? "invoices"];
  await mkdir(path.join(process.cwd(), relativeDir), { recursive: true });

  const extension = path.extname(params.fileName) || "";
  const storedName = `${randomUUID()}${extension}`;
  const storedPath = path.join(relativeDir, storedName);

  await writeFile(path.join(process.cwd(), storedPath), params.buffer);

  return {
    storedPath,
    storedName,
    mimeType: params.mimeType ?? "application/octet-stream",
    size: params.buffer.length,
  };
}

export function getUploadAbsolutePath(storedPath: string) {
  if (!path.isAbsolute(storedPath)) {
    return path.join(process.cwd(), storedPath);
  }

  // Legacy rows stored absolute paths, which break whenever the project
  // directory moves. Re-anchor anything inside an "uploads" directory to the
  // current project root.
  const marker = `${path.sep}uploads${path.sep}`;
  const markerIndex = storedPath.lastIndexOf(marker);
  if (markerIndex !== -1) {
    return path.join(process.cwd(), storedPath.slice(markerIndex + 1));
  }

  return storedPath;
}
