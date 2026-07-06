import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { extractTextFromDocument } from "@/lib/document-text";
import * as XLSX from "xlsx";

const tempDirs: string[] = [];

afterEach(async () => {
  tempDirs.length = 0;
});

async function writeTempFile(fileName: string, contents: string | Buffer) {
  const dir = await mkdtemp(join(tmpdir(), "invoice-doc-"));
  tempDirs.push(dir);
  const absolutePath = join(dir, fileName);
  await writeFile(absolutePath, contents);
  return { absolutePath, relativePath: fileName };
}

describe("extractTextFromDocument", () => {
  it("extracts csv text", async () => {
    const { absolutePath } = await writeTempFile(
      "invoice.csv",
      "description,amount\nFreight,100\nFuel,20\n",
    );

    const result = await extractTextFromDocument(absolutePath, "invoice.csv", "text/csv");
    expect(result.kind).toBe("csv");
    expect(result.text).toContain("Freight,100");
    expect(absolutePath).toBeTruthy();
  });

  it("rejects non-pdf content even when named .pdf", async () => {
    const { absolutePath } = await writeTempFile(
      "invoice.pdf",
      "This is not really a PDF file",
    );

    await expect(
      extractTextFromDocument(absolutePath, "invoice.pdf", "application/pdf"),
    ).rejects.toThrow("not a valid PDF");
  });

  it("extracts spreadsheet text from xlsx", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["description", "amount"],
      ["Freight", 100],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Invoice");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const { absolutePath } = await writeTempFile("invoice.xlsx", buffer);
    const result = await extractTextFromDocument(
      absolutePath,
      "invoice.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    expect(result.kind).toBe("xlsx");
    expect(result.text).toContain("Freight");
    expect(result.text).toContain("100");
  });
});
