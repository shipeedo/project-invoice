import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  buildCreditSubmissionWorkbook,
  buildCreditSubmissionXlsxBuffer,
} from "@/lib/credit-submission-export";

describe("credit submission export", () => {
  it("builds an xlsx workbook with line details and reasons", async () => {
    const buffer = await buildCreditSubmissionXlsxBuffer({
      invoiceNumber: "INV-1",
      invoiceDate: new Date("2026-01-15T00:00:00.000Z"),
      vendorName: "Carrier Co",
      currency: "AUD",
      notes: "Please review",
      lineItems: [
        {
          lineIndex: 0,
          lineNumber: 1,
          description: "Freight",
          serviceType: "Express",
          reference: "REF-1",
          invoiceAmount: 100,
          requestedAmount: 100,
          reason: "NOT_OUR_CONSIGNMENT",
        },
        {
          lineIndex: 1,
          lineNumber: 2,
          description: "Fuel surcharge",
          reference: "REF-2",
          invoiceAmount: 20,
          requestedAmount: 15,
          reason: "OTHER",
          reasonDetail: "Duplicate charge",
        },
      ],
    });

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets["Credit Request"];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      defval: "",
    });

    expect(rows[0]?.[0]).toBe("Credit Request");
    expect(rows[1]?.slice(0, 4)).toEqual(["Invoice Number", "INV-1", "Invoice Date", "2026-01-15"]);
    expect(rows[4]?.slice(0, 7)).toEqual([
      "Line",
      "Type",
      "Reference",
      "Description",
      "Invoiced Amount",
      "Credit Amount",
      "Reason",
    ]);
    expect(rows[5]?.slice(0, 7)).toEqual([
      1,
      "Express",
      "REF-1",
      "Freight",
      100,
      100,
      "Not our consignment",
    ]);
    expect(rows[6]?.[6]).toBe("Duplicate charge");
    expect(rows[8]?.slice(0, 7)).toEqual(["", "", "", "Total", 120, 115, ""]);
    expect(rows[10]?.slice(0, 2)).toEqual(["Notes", "Please review"]);
  });

  it("creates a workbook object for manual inspection", async () => {
    const workbook = await buildCreditSubmissionWorkbook({
      lineItems: [
        {
          lineIndex: 0,
          description: "Freight",
          requestedAmount: 50,
          reason: "SERVICE_DOWNGRADE",
        },
      ],
    });
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Credit Request"]);
  });

  it("uses requestedTotal for the total row when provided", async () => {
    const buffer = await buildCreditSubmissionXlsxBuffer({
      requestedTotal: 99.5,
      lineItems: [
        {
          lineIndex: 0,
          description: "Freight",
          invoiceAmount: 100,
          requestedAmount: 100,
          reason: "NOT_OUR_CONSIGNMENT",
        },
      ],
    });

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets["Credit Request"];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      defval: "",
    });

    expect(rows[7]?.slice(0, 7)).toEqual(["", "", "", "Total", 100, 99.5, ""]);
  });

  it("adds a GST row before the total", async () => {
    const buffer = await buildCreditSubmissionXlsxBuffer({
      gstAmount: 11.5,
      lineItems: [
        {
          description: "Freight",
          invoiceAmount: 100,
          requestedAmount: 100,
          reason: "NOT_OUR_CONSIGNMENT",
        },
      ],
    });

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets["Credit Request"];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      defval: "",
    });

    expect(rows[5]?.[0]).toBe(1);
    expect(rows[6]?.slice(3, 6)).toEqual(["GST", "", 11.5]);
    expect(rows[8]?.slice(0, 7)).toEqual(["", "", "", "Total", 100, 111.5, ""]);
  });

  it("applies carrier template colors to headers, rows, and totals", async () => {
    const buffer = await buildCreditSubmissionXlsxBuffer({
      lineItems: [
        {
          lineIndex: 0,
          description: "Freight",
          reference: "REF-1",
          invoiceAmount: 10,
          requestedAmount: 10,
          reason: "NOT_OUR_CONSIGNMENT",
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    // exceljs types its own global `Buffer extends ArrayBuffer`, which Node's
    // Buffer no longer satisfies under ES2024 libs.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Credit Request");
    expect(sheet).toBeDefined();

    const header = sheet!.getRow(5);
    expect(header.getCell(1).fill).toMatchObject({
      fgColor: { indexed: 11 },
    });
    expect(header.getCell(6).fill).toMatchObject({
      fgColor: { indexed: 10 },
    });

    const line = sheet!.getRow(6);
    expect(line.getCell(3).fill).toMatchObject({
      fgColor: { argb: "FFF0F0F4" },
    });
    expect(line.getCell(5).fill).toMatchObject({
      fgColor: { argb: "FFFFFFFF" },
    });
    expect(line.getCell(3).border?.left?.color).toMatchObject({
      argb: "FFCAC9D9",
    });

    const total = sheet!.getRow(8);
    expect(total.getCell(5).fill).toMatchObject({
      fgColor: { argb: "FF92D050" },
    });
  });
});
