import { readFile } from "fs/promises";
import * as XLSX from "xlsx";
import { classifyAttachment } from "@/lib/attachment-types";
import { getUploadAbsolutePath } from "@/lib/uploads";

const MAX_PREVIEW_ROWS = 200;
// Generous bound: real invoice exports run 30-40 columns; this only guards
// against degenerate files (xlsx allows 16k columns).
const MAX_PREVIEW_COLUMNS = 100;

export type SpreadsheetPreviewSheet = {
  name: string;
  rows: string[][];
  truncated: boolean;
};

export type SpreadsheetPreview = {
  sheets: SpreadsheetPreviewSheet[];
};

function toCellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Reads a CSV/XLSX/XLS attachment from uploads and returns a bounded grid for
 * inline display. Returns null when the file is not a spreadsheet or cannot
 * be parsed, so callers can fall back to a plain link.
 */
export async function readSpreadsheetPreview(
  filePath: string,
  fileName: string,
  mimeType?: string | null,
): Promise<SpreadsheetPreview | null> {
  const kind = classifyAttachment(fileName, mimeType);
  if (kind !== "csv" && kind !== "xlsx" && kind !== "xls") return null;

  try {
    const buffer = await readFile(getUploadAbsolutePath(filePath));
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
      });

      const truncated =
        grid.length > MAX_PREVIEW_ROWS ||
        grid.some((row) => row.length > MAX_PREVIEW_COLUMNS);

      const rows = grid
        .slice(0, MAX_PREVIEW_ROWS)
        .map((row) => row.slice(0, MAX_PREVIEW_COLUMNS).map(toCellText));

      return { name, rows, truncated };
    }).filter((sheet) => sheet.rows.length > 0);

    return sheets.length > 0 ? { sheets } : null;
  } catch {
    return null;
  }
}
