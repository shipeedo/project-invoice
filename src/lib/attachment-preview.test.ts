import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readSpreadsheetPreview } from "@/lib/attachment-preview";

async function writeTempFile(fileName: string, contents: string | Buffer) {
  const dir = await mkdtemp(join(tmpdir(), "invoice-preview-"));
  const absolutePath = join(dir, fileName);
  await writeFile(absolutePath, contents);
  return absolutePath;
}

describe("readSpreadsheetPreview", () => {
  it("pads ragged rows to a uniform width", async () => {
    const absolutePath = await writeTempFile(
      "invoice.csv",
      "description,amount\nFreight,100,extra,cells\nFuel\n",
    );

    const preview = await readSpreadsheetPreview(
      absolutePath,
      "invoice.csv",
      "text/csv",
    );

    expect(preview).not.toBeNull();
    const rows = preview!.sheets[0].rows;
    expect(rows).toEqual([
      ["description", "amount", "", ""],
      ["Freight", "100", "extra", "cells"],
      ["Fuel", "", "", ""],
    ]);
  });

  it("fills holes left by blank cells mid-row", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["a", "b", "c"],
      ["x", null, "z"],
      ["only-first"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;

    const absolutePath = await writeTempFile("invoice.xlsx", buffer);
    const preview = await readSpreadsheetPreview(
      absolutePath,
      "invoice.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    expect(preview).not.toBeNull();
    const rows = preview!.sheets[0].rows;
    // Every row must be dense (no holes) and the same length.
    for (const row of rows) {
      expect(row.length).toBe(3);
      expect(Object.keys(row).length).toBe(3);
    }
    expect(rows[1]).toEqual(["x", "", "z"]);
    expect(rows[2]).toEqual(["only-first", "", ""]);
  });
});
