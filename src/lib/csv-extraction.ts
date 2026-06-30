import type { ExtractedLineItem } from "@/lib/extraction";

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

export function parseCsvLineItems(content: string): ExtractedLineItem[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const descriptionIndex = headers.findIndex((header) =>
    ["description", "charge_description", "item", "details"].includes(header),
  );
  const amountIndex = headers.findIndex((header) =>
    ["amount", "total", "line_total", "charge"].includes(header),
  );
  const quantityIndex = headers.findIndex((header) =>
    ["quantity", "qty"].includes(header),
  );
  const referenceIndex = headers.findIndex((header) =>
    ["reference", "consignment", "consignment_number", "tracking"].includes(header),
  );

  const lineItems: ExtractedLineItem[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index]);
    const description =
      descriptionIndex >= 0 ? values[descriptionIndex]?.trim() : values[0]?.trim();
    if (!description) continue;

    lineItems.push({
      lineNumber: index,
      description,
      quantity: quantityIndex >= 0 ? toNumber(values[quantityIndex]) : undefined,
      amount: amountIndex >= 0 ? toNumber(values[amountIndex]) : undefined,
      reference:
        referenceIndex >= 0 ? values[referenceIndex]?.trim() || undefined : undefined,
    });
  }

  return lineItems;
}

export function mergeLineItems(
  pdfItems: ExtractedLineItem[],
  csvItems: ExtractedLineItem[],
) {
  if (pdfItems.length === 0) return csvItems;
  if (csvItems.length === 0) return pdfItems;
  return pdfItems.length >= csvItems.length ? pdfItems : csvItems;
}
