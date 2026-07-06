export type InvoiceAttachmentKind =
  | "pdf"
  | "csv"
  | "xlsx"
  | "xls"
  | "docx"
  | "doc"
  | "unknown";

const EXTENSION_KIND: Record<string, InvoiceAttachmentKind> = {
  pdf: "pdf",
  csv: "csv",
  xlsx: "xlsx",
  xls: "xls",
  docx: "docx",
  doc: "doc",
};

const MIME_KIND: Array<[RegExp | string, InvoiceAttachmentKind]> = [
  ["application/pdf", "pdf"],
  ["text/csv", "csv"],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx",
  ],
  ["application/vnd.ms-excel", "xls"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ],
  ["application/msword", "doc"],
];

export function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

export function classifyAttachment(
  fileName: string,
  mimeType?: string | null,
): InvoiceAttachmentKind {
  const extension = extensionOf(fileName);
  if (extension && EXTENSION_KIND[extension]) {
    return EXTENSION_KIND[extension];
  }

  const normalizedMime = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  for (const [pattern, kind] of MIME_KIND) {
    if (typeof pattern === "string") {
      if (normalizedMime === pattern) return kind;
    } else if (pattern.test(normalizedMime)) {
      return kind;
    }
  }

  return "unknown";
}

export function isInvoiceLikeAttachment(fileName: string, mimeType?: string | null) {
  return classifyAttachment(fileName, mimeType) !== "unknown";
}

export function isPdfAttachment(fileName: string, mimeType?: string | null) {
  return classifyAttachment(fileName, mimeType) === "pdf";
}

export function isCsvAttachment(fileName: string, mimeType?: string | null) {
  return classifyAttachment(fileName, mimeType) === "csv";
}

export function isSpreadsheetAttachment(fileName: string, mimeType?: string | null) {
  const kind = classifyAttachment(fileName, mimeType);
  return kind === "xlsx" || kind === "xls" || kind === "csv";
}

export function isWordAttachment(fileName: string, mimeType?: string | null) {
  const kind = classifyAttachment(fileName, mimeType);
  return kind === "docx" || kind === "doc";
}

const EXTRACTION_PRIORITY: InvoiceAttachmentKind[] = [
  "pdf",
  "xlsx",
  "xls",
  "docx",
  "doc",
  "csv",
];

export function pickPrimaryInvoiceAttachment<
  T extends { fileName: string; mimeType: string },
>(attachments: T[]) {
  for (const kind of EXTRACTION_PRIORITY) {
    const match = attachments.find(
      (attachment) => classifyAttachment(attachment.fileName, attachment.mimeType) === kind,
    );
    if (match) {
      return { attachment: match, kind };
    }
  }
  return null;
}

export function countInvoiceLikeAttachments(
  attachments: Array<{ fileName: string; mimeType?: string | null }>,
) {
  return attachments.filter((attachment) =>
    isInvoiceLikeAttachment(attachment.fileName, attachment.mimeType),
  ).length;
}
