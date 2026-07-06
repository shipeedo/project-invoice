import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  extractSpreadsheetMetadata,
  parseCsvLineItems,
  parseSpreadsheetLineItems,
} from "@/lib/csv-extraction";

describe("parseCsvLineItems", () => {
  it("parses transport consignment rows with cost column", () => {
    const csv = `Consignments,Items,CBM,Weight,Cost
126908846,1,5.647,55.9,$14.50
128192184,1,0.168,20,$12.00`;

    const items = parseCsvLineItems(csv);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      lineNumber: 1,
      description: "Consignment 126908846 — 1 item — 5.647 CBM — 55.9 kg",
      quantity: 1,
      amount: 14.5,
      reference: "126908846",
    });
  });

  it("parses invoice data report rows without amount column", () => {
    const csv = `InvoiceNumber,InvoiceDate,InvoiceId,ReferenceNo,InvoiceDetailType,ConsignmentNumber,TotalCbm,TotalWeight,TotalItems,ConsignmentId,FromStateCode,ToStateCode,ToPostCode
INV001135,2026-06-28T14:00:00.000Z,136,,9,6044152565,0.196,52,3,00369013-c639-a730-8c17-3a21daf9c135,NSW,QLD,4306`;

    const items = parseCsvLineItems(csv);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      description: "9 — Consignment 6044152565 — 3 items — 0.196 CBM — 52 kg",
      quantity: 3,
      reference: "6044152565",
      serviceType: "9",
    });
    expect(items[0].amount).toBeUndefined();
  });
});

describe("parseSpreadsheetLineItems", () => {
  it("parses multi-sheet spreadsheet text", () => {
    const text = `Sheet: Summary
Consignments,Items,CBM,Weight,Cost
126908846,1,5.647,55.9,$14.50

Sheet: Detail
InvoiceNumber,InvoiceDate,ConsignmentNumber,TotalItems,TotalCbm,TotalWeight
INV001135,2026-06-28T14:00:00.000Z,6044152565,3,0.196,52`;

    const items = parseSpreadsheetLineItems(text);
    expect(items).toHaveLength(2);
    expect(items[0].amount).toBe(14.5);
    expect(items[1].reference).toBe("6044152565");
  });

  it("parses a real xlsx export shape", () => {
    const workbook = XLSX.utils.book_new();
    const summary = XLSX.utils.aoa_to_sheet([
      ["Consignments", "Items", "CBM", "Weight", "Cost"],
      ["126908846", 1, 5.647, 55.9, "$14.50"],
    ]);
    const detail = XLSX.utils.aoa_to_sheet([
      [
        "InvoiceNumber",
        "InvoiceDate",
        "ConsignmentNumber",
        "TotalItems",
        "TotalCbm",
        "TotalWeight",
      ],
      ["INV001135", "2026-06-28T14:00:00.000Z", "6044152565", 3, 0.196, 52],
    ]);
    XLSX.utils.book_append_sheet(workbook, summary, "Summary");
    XLSX.utils.book_append_sheet(workbook, detail, "Detail");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const parsedWorkbook = XLSX.read(buffer, { type: "buffer" });
    const sections = parsedWorkbook.SheetNames.map((sheetName) => {
      const csv = XLSX.utils.sheet_to_csv(parsedWorkbook.Sheets[sheetName], {
        blankrows: false,
      });
      return `Sheet: ${sheetName}\n${csv}`;
    }).join("\n\n");

    const items = parseSpreadsheetLineItems(sections);
    expect(items).toHaveLength(2);
    expect(extractSpreadsheetMetadata(sections)).toMatchObject({
      invoiceNumber: "INV001135",
      invoiceDate: "2026-06-28",
      totalAmount: 14.5,
    });
  });
});
