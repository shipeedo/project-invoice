import ExcelJS from "exceljs";
import { creditLineDescription, type CreditRequestLineItem } from "@/lib/credit-line-utils";
import { formatCreditLineReason } from "@/lib/credit-reasons";
import { roundToTwoDecimals } from "@/lib/format";

export type CreditSubmissionParams = {
  invoiceNumber?: string | null;
  invoiceDate?: Date | null;
  vendorName?: string | null;
  customerName?: string | null;
  currency?: string | null;
  notes?: string | null;
  requestedTotal?: number | null;
  gstAmount?: number | null;
  lineItems: CreditRequestLineItem[];
};

/** Matches the carrier credit request template in example credit request.xlsx */
const CREDIT_TEMPLATE_COLORS = {
  border: "FFCAC9D9",
  white: "FFFFFFFF",
  altFill: "FFF0F0F4",
  totalGreen: "FF92D050",
  black: "FF000000",
  headerPrimary: 11,
  headerSecondary: 10,
  textBlack: 8,
} as const;

const MONEY_FORMAT = "$#,##0.00;[Red]\"-$\"#,##0.00";

function indexedColor(index: number): ExcelJS.Color {
  return { indexed: index } as unknown as ExcelJS.Color;
}

function indexedFillColor(index: number): ExcelJS.Color {
  return { indexed: index } as unknown as ExcelJS.Color;
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return roundToTwoDecimals(value);
}

function thinBorder(color = CREDIT_TEMPLATE_COLORS.border): Partial<ExcelJS.Borders> {
  const edge = { style: "thin" as const, color: { argb: color } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function applyHeaderStyle(cell: ExcelJS.Cell, indexedFill: number) {
  cell.font = {
    bold: true,
    size: 10,
    name: "Calibri",
    color: indexedColor(CREDIT_TEMPLATE_COLORS.textBlack),
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: indexedFillColor(indexedFill),
    bgColor: indexedFillColor(64),
  };
  cell.border = thinBorder();
  cell.alignment = { wrapText: true, vertical: "middle" };
}

function applyDataStyle(
  cell: ExcelJS.Cell,
  options: {
    fillArgb?: string;
    horizontal?: "left" | "right" | "center";
    numFmt?: string;
  } = {},
) {
  cell.font = {
    size: 8,
    name: "Arial",
    color: { argb: CREDIT_TEMPLATE_COLORS.black },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: options.fillArgb ?? CREDIT_TEMPLATE_COLORS.white },
    bgColor: { argb: CREDIT_TEMPLATE_COLORS.white },
  };
  cell.border = thinBorder();
  cell.alignment = {
    horizontal: options.horizontal ?? "left",
    vertical: "middle",
    wrapText: true,
  };
  if (options.numFmt) {
    cell.numFmt = options.numFmt;
  }
}

function applyTotalStyle(
  cell: ExcelJS.Cell,
  options: { horizontal?: "left" | "right"; numFmt?: string } = {},
) {
  cell.font = {
    size: 11,
    name: "Calibri",
    color: { theme: 1 },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: CREDIT_TEMPLATE_COLORS.totalGreen },
    bgColor: indexedFillColor(64),
  };
  cell.border = thinBorder();
  cell.alignment = { horizontal: options.horizontal ?? "left", vertical: "middle" };
  if (options.numFmt) {
    cell.numFmt = options.numFmt;
  }
}

export async function buildCreditSubmissionWorkbook(params: CreditSubmissionParams) {
  const currency = params.currency ?? "AUD";
  const invoiceDate = formatDate(params.invoiceDate);
  const customer = params.customerName ?? params.vendorName ?? "";
  const totalInvoiced = params.lineItems.reduce(
    (sum, line) => sum + (line.invoiceAmount ?? 0),
    0,
  );
  const gstAmount = formatMoney(params.gstAmount);
  const totalCredit =
    params.requestedTotal != null && Number.isFinite(params.requestedTotal)
      ? params.requestedTotal
      : params.lineItems.reduce(
          (sum, line) => sum + (line.requestedAmount ?? 0),
          0,
        ) + (gstAmount ?? 0);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Credit Request");

  sheet.columns = [
    { width: 8 },
    { width: 18 },
    { width: 18 },
    { width: 36 },
    { width: 16 },
    { width: 16 },
    { width: 32 },
  ];

  const titleRow = sheet.addRow(["Credit Request"]);
  titleRow.getCell(1).font = { bold: true, size: 14, name: "Calibri" };
  sheet.mergeCells(titleRow.number, 1, titleRow.number, 7);

  const invoiceRow = sheet.addRow([
    "Invoice Number",
    params.invoiceNumber ?? "",
    "Invoice Date",
    invoiceDate,
  ]);
  invoiceRow.getCell(1).font = { bold: true, size: 10, name: "Calibri" };
  invoiceRow.getCell(3).font = { bold: true, size: 10, name: "Calibri" };

  const customerRow = sheet.addRow(["Customer", customer, "Currency", currency]);
  customerRow.getCell(1).font = { bold: true, size: 10, name: "Calibri" };
  customerRow.getCell(3).font = { bold: true, size: 10, name: "Calibri" };

  sheet.addRow([]);

  const headerLabels = [
    "Line",
    "Type",
    "Reference",
    "Description",
    "Invoiced Amount",
    "Credit Amount",
    "Reason",
  ];
  const headerRow = sheet.addRow(headerLabels);
  headerLabels.forEach((_, index) => {
    applyHeaderStyle(
      headerRow.getCell(index + 1),
      index < 5
        ? CREDIT_TEMPLATE_COLORS.headerPrimary
        : CREDIT_TEMPLATE_COLORS.headerSecondary,
    );
  });

  params.lineItems.forEach((line, index) => {
    const altFill =
      index % 2 === 0 ? CREDIT_TEMPLATE_COLORS.altFill : CREDIT_TEMPLATE_COLORS.white;
    const reasonFill =
      index % 2 === 0 ? CREDIT_TEMPLATE_COLORS.white : CREDIT_TEMPLATE_COLORS.altFill;
    const row = sheet.addRow([
      line.lineNumber ?? (line.lineIndex != null ? line.lineIndex + 1 : index + 1),
      line.serviceType ?? "",
      line.reference ?? "",
      creditLineDescription(line),
      formatMoney(line.invoiceAmount),
      formatMoney(line.requestedAmount),
      formatCreditLineReason(line),
    ]);

    applyDataStyle(row.getCell(1), { fillArgb: altFill, horizontal: "center" });
    applyDataStyle(row.getCell(2), { fillArgb: altFill });
    applyDataStyle(row.getCell(3), { fillArgb: altFill });
    applyDataStyle(row.getCell(4), { fillArgb: altFill });
    applyDataStyle(row.getCell(5), {
      fillArgb: CREDIT_TEMPLATE_COLORS.white,
      horizontal: "right",
      numFmt: MONEY_FORMAT,
    });
    applyDataStyle(row.getCell(6), {
      fillArgb: CREDIT_TEMPLATE_COLORS.white,
      horizontal: "right",
      numFmt: MONEY_FORMAT,
    });
    applyDataStyle(row.getCell(7), { fillArgb: reasonFill });
  });

  const surchargeRows: Array<[string, number]> = [];
  if (gstAmount != null) surchargeRows.push(["GST", gstAmount]);

  for (const [label, amount] of surchargeRows) {
    const row = sheet.addRow(["", "", "", label, null, amount, ""]);
    for (let column = 1; column <= 7; column += 1) {
      applyDataStyle(row.getCell(column), {
        horizontal: column >= 5 && column <= 6 ? "right" : "left",
        numFmt: column === 6 ? MONEY_FORMAT : undefined,
      });
    }
  }

  sheet.addRow([]);

  const totalRow = sheet.addRow(["", "", "", "Total", formatMoney(totalInvoiced), formatMoney(totalCredit), ""]);
  applyTotalStyle(totalRow.getCell(4), { horizontal: "right" });
  applyTotalStyle(totalRow.getCell(5), { horizontal: "right", numFmt: MONEY_FORMAT });
  applyTotalStyle(totalRow.getCell(6), { horizontal: "right", numFmt: MONEY_FORMAT });

  if (params.notes?.trim()) {
    sheet.addRow([]);
    const notesRow = sheet.addRow(["Notes", params.notes.trim()]);
    notesRow.getCell(1).font = { bold: true, size: 10, name: "Calibri" };
    sheet.mergeCells(notesRow.number, 2, notesRow.number, 7);
    applyDataStyle(notesRow.getCell(2), { fillArgb: CREDIT_TEMPLATE_COLORS.altFill });
  }

  return workbook;
}

export async function buildCreditSubmissionXlsxBuffer(params: CreditSubmissionParams) {
  const workbook = await buildCreditSubmissionWorkbook(params);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
