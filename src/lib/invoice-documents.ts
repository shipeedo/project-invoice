// Shared upload validation and display helpers for invoice documents
// (Documents card uploads and rebill attachments).

export const DOCUMENT_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".csv",
  ".xlsx",
  ".xls",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
] as const;

export const REBILL_UPLOAD_EXTENSIONS = [".pdf", ".csv", ".xlsx", ".xls"] as const;

// Credit notes received back from the carrier when recording an outcome.
export const CREDIT_NOTE_UPLOAD_EXTENSIONS = [".pdf", ".csv", ".xlsx", ".xls"] as const;

export const DOCUMENT_UPLOAD_ACCEPT = DOCUMENT_UPLOAD_EXTENSIONS.join(",");
export const REBILL_UPLOAD_ACCEPT = REBILL_UPLOAD_EXTENSIONS.join(",");
export const CREDIT_NOTE_UPLOAD_ACCEPT = CREDIT_NOTE_UPLOAD_EXTENSIONS.join(",");

export function hasAllowedExtension(
  fileName: string,
  extensions: readonly string[],
) {
  const lower = fileName.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

export function formatFileSize(size: number | null | undefined) {
  if (size == null || !Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function documentKindLabel(kind: string) {
  switch (kind) {
    case "REBILL":
      return "Rebill";
    case "CREDIT":
      return "Credit";
    default:
      return "General";
  }
}
