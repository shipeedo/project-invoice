import type { ExtractedInvoice, ExtractedLineItem } from "@/lib/extraction";

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function toNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header));
}

function splitSpreadsheetSections(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("Sheet: ")) {
    return [{ sheetName: null as string | null, content: trimmed }];
  }

  const parts = trimmed.split(/\n\n(?=Sheet: )/);
  return parts
    .map((part) => {
      const match = part.match(/^Sheet: ([^\n]+)\n([\s\S]*)$/);
      if (!match) return null;
      return { sheetName: match[1], content: match[2].trim() };
    })
    .filter((section): section is { sheetName: string; content: string } => section !== null);
}

function buildLineDescription(
  values: string[],
  headers: string[],
  indices: {
    description: number;
    reference: number;
    quantity: number;
    cbm: number;
    weight: number;
    serviceType: number;
  },
) {
  if (indices.description >= 0) {
    const description = values[indices.description]?.trim();
    if (description) return description;
  }

  const parts: string[] = [];
  const reference = indices.reference >= 0 ? values[indices.reference]?.trim() : undefined;
  const serviceType =
    indices.serviceType >= 0 ? values[indices.serviceType]?.trim() : undefined;
  const cbm = indices.cbm >= 0 ? values[indices.cbm]?.trim() : undefined;
  const weight = indices.weight >= 0 ? values[indices.weight]?.trim() : undefined;
  const quantity =
    indices.quantity >= 0 ? values[indices.quantity]?.trim() : undefined;

  if (serviceType) parts.push(serviceType);
  if (reference) parts.push(`Consignment ${reference}`);
  if (quantity) parts.push(`${quantity} item${quantity === "1" ? "" : "s"}`);
  if (cbm) parts.push(`${cbm} CBM`);
  if (weight) parts.push(`${weight} kg`);

  if (parts.length > 0) return parts.join(" — ");

  return values.find((value) => value.trim())?.trim() ?? "";
}

function parseCsvSection(content: string, lineOffset = 0): ExtractedLineItem[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const descriptionIndex = findHeaderIndex(headers, [
    "description",
    "charge_description",
    "item",
    "details",
    "invoice_detail_type",
  ]);
  const amountIndex = findHeaderIndex(headers, [
    "amount",
    "total",
    "line_total",
    "charge",
    "cost",
    "price",
    "line_amount",
  ]);
  const quantityIndex = findHeaderIndex(headers, [
    "quantity",
    "qty",
    "items",
    "total_items",
    "totalitems",
  ]);
  const referenceIndex = findHeaderIndex(headers, [
    "reference",
    "consignment",
    "consignment_number",
    "consignments",
    "consignmentnumber",
    "tracking",
    "reference_no",
  ]);
  const cbmIndex = findHeaderIndex(headers, ["cbm", "total_cbm", "totalcbm"]);
  const weightIndex = findHeaderIndex(headers, ["weight", "total_weight", "totalweight"]);
  const serviceTypeIndex = findHeaderIndex(headers, [
    "service_type",
    "servicetype",
    "invoice_detail_type",
    "invoicedetailtype",
  ]);

  const lineItems: ExtractedLineItem[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index]);
    const description = buildLineDescription(values, headers, {
      description: descriptionIndex,
      reference: referenceIndex,
      quantity: quantityIndex,
      cbm: cbmIndex,
      weight: weightIndex,
      serviceType: serviceTypeIndex,
    });
    if (!description) continue;

    lineItems.push({
      lineNumber: lineOffset + index,
      description,
      quantity: quantityIndex >= 0 ? toNumber(values[quantityIndex]) : undefined,
      amount: amountIndex >= 0 ? toNumber(values[amountIndex]) : undefined,
      reference:
        referenceIndex >= 0 ? values[referenceIndex]?.trim() || undefined : undefined,
      serviceType:
        serviceTypeIndex >= 0 ? values[serviceTypeIndex]?.trim() || undefined : undefined,
    });
  }

  return lineItems;
}

export function parseCsvLineItems(content: string): ExtractedLineItem[] {
  return parseCsvSection(content);
}

export function parseSpreadsheetLineItems(text: string): ExtractedLineItem[] {
  const sections = splitSpreadsheetSections(text);
  const lineItems: ExtractedLineItem[] = [];
  let lineOffset = 0;

  for (const section of sections) {
    const parsed = parseCsvSection(section.content, lineOffset);
    lineOffset += parsed.length;
    lineItems.push(...parsed);
  }

  return lineItems;
}

function normalizeSpreadsheetDate(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

export function extractSpreadsheetMetadata(text: string): Partial<ExtractedInvoice> {
  const sections = splitSpreadsheetSections(text);
  const invoiceNumbers = new Map<string, number>();
  const invoiceDates = new Map<string, number>();
  let lineItemTotal = 0;
  let pricedLineCount = 0;

  for (const section of sections) {
    const lines = section.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;

    const headers = splitCsvLine(lines[0]).map(normalizeHeader);
    const invoiceNumberIndex = findHeaderIndex(headers, [
      "invoice_number",
      "invoicenumber",
      "invoice_no",
      "invoice",
    ]);
    const invoiceDateIndex = findHeaderIndex(headers, [
      "invoice_date",
      "invoicedate",
      "date",
    ]);
    const amountIndex = findHeaderIndex(headers, [
      "amount",
      "total",
      "line_total",
      "charge",
      "cost",
      "price",
      "line_amount",
    ]);

    for (let index = 1; index < lines.length; index += 1) {
      const values = splitCsvLine(lines[index]);
      const invoiceNumber =
        invoiceNumberIndex >= 0 ? values[invoiceNumberIndex]?.trim() : undefined;
      const invoiceDate =
        invoiceDateIndex >= 0 ? values[invoiceDateIndex]?.trim() : undefined;
      const amount = amountIndex >= 0 ? toNumber(values[amountIndex]) : undefined;

      if (invoiceNumber) {
        invoiceNumbers.set(invoiceNumber, (invoiceNumbers.get(invoiceNumber) ?? 0) + 1);
      }
      const normalizedDate = normalizeSpreadsheetDate(invoiceDate);
      if (normalizedDate) {
        invoiceDates.set(normalizedDate, (invoiceDates.get(normalizedDate) ?? 0) + 1);
      }
      if (amount !== undefined) {
        lineItemTotal += amount;
        pricedLineCount += 1;
      }
    }
  }

  const invoiceNumber = [...invoiceNumbers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const invoiceDate = [...invoiceDates.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    invoiceNumber,
    invoiceDate,
    totalAmount: pricedLineCount > 0 ? lineItemTotal : undefined,
    currency: "AUD",
  };
}

export function mergeLineItems(
  pdfItems: ExtractedLineItem[],
  csvItems: ExtractedLineItem[],
) {
  if (pdfItems.length === 0) return csvItems;
  if (csvItems.length === 0) return pdfItems;
  return pdfItems.length >= csvItems.length ? pdfItems : csvItems;
}

export function mergeExtractedInvoiceData(
  primary: ExtractedInvoice | null | undefined,
  fallback: Partial<ExtractedInvoice>,
): ExtractedInvoice | null {
  if (!primary && Object.keys(fallback).length === 0) return null;

  return {
    documentType: primary?.documentType ?? fallback.documentType,
    vendorName: primary?.vendorName ?? fallback.vendorName,
    vendorEmail: primary?.vendorEmail ?? fallback.vendorEmail,
    invoiceNumber: primary?.invoiceNumber ?? fallback.invoiceNumber,
    invoiceDate: primary?.invoiceDate ?? fallback.invoiceDate,
    dueDate: primary?.dueDate ?? fallback.dueDate,
    respondByDate: primary?.respondByDate ?? fallback.respondByDate,
    totalAmount: primary?.totalAmount ?? fallback.totalAmount,
    subtotal: primary?.subtotal ?? fallback.subtotal,
    taxAmount: primary?.taxAmount ?? fallback.taxAmount,
    currency: primary?.currency ?? fallback.currency ?? "AUD",
    lineItems:
      primary?.lineItems && primary.lineItems.length > 0
        ? primary.lineItems
        : (fallback.lineItems ?? primary?.lineItems ?? []),
    fieldCandidates: primary?.fieldCandidates ?? fallback.fieldCandidates,
    confidence: primary?.confidence ?? fallback.confidence,
    notes: primary?.notes ?? fallback.notes,
  };
}
