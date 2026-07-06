import { and, eq } from "drizzle-orm";
import { db, suppliers, type Supplier } from "@/lib/db";
import { INVOICE_EXTRACTION_SYSTEM_PROMPT } from "@/lib/extraction-prompts";
import {
  FIELD_LABELS,
  type ExtractionCandidates,
  type SupplierFieldMappings,
  type ValidatableField,
} from "@/lib/extraction-types";
import { parseSupplierFieldMappings } from "@/lib/extraction-types";
import { normalizeTradingTermDays } from "@/lib/trading-terms";

export type SupplierExtractionContext = {
  supplier: Supplier | null;
  extractionPrompt: string | null;
  fieldMappings: SupplierFieldMappings;
};

const MAPPINGS_SECTION_HEADER = "## Supplier-specific field mappings";
const EXTRACTION_NOTES_HEADER = "Extraction notes for this supplier's invoices:";

export function getDefaultExtractionPrompt() {
  return INVOICE_EXTRACTION_SYSTEM_PROMPT;
}

export function buildNewSupplierValues(params: {
  organizationId: string;
  name: string;
  emailAddresses?: string[];
  emailDomains?: string[];
  tradingTermDays?: number | null;
}) {
  return {
    organizationId: params.organizationId,
    name: params.name.trim(),
    emailAddresses: JSON.stringify(params.emailAddresses ?? []),
    emailDomains: JSON.stringify(params.emailDomains ?? []),
    tradingTermDays: normalizeTradingTermDays(params.tradingTermDays),
    extractionPrompt: getDefaultExtractionPrompt(),
    fieldMappings: "{}",
  };
}

function normalizeForMatch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function supplierMatchesName(supplier: Supplier, name: string) {
  return normalizeForMatch(supplier.name) === normalizeForMatch(name);
}

function supplierMatchesEmail(supplier: Supplier, email: string) {
  const normalized = email.trim().toLowerCase();
  const addresses = JSON.parse(supplier.emailAddresses) as string[];
  if (addresses.some((entry) => entry.toLowerCase() === normalized)) {
    return true;
  }
  const domain = normalized.split("@")[1];
  if (!domain) return false;
  const domains = JSON.parse(supplier.emailDomains) as string[];
  return domains.some((entry) => entry.toLowerCase() === domain);
}

export async function findMatchingSupplier(
  organizationId: string,
  vendorName?: string | null,
  vendorEmail?: string | null,
): Promise<Supplier | null> {
  const rows = await db.query.suppliers.findMany({
    where: eq(suppliers.organizationId, organizationId),
  });

  if (vendorEmail) {
    const byEmail = rows.find((supplier) => supplierMatchesEmail(supplier, vendorEmail));
    if (byEmail) return byEmail;
  }

  if (vendorName) {
    const byName = rows.find((supplier) => supplierMatchesName(supplier, vendorName));
    if (byName) return byName;
  }

  return null;
}

export async function getSupplierExtractionContext(
  organizationId: string,
  supplierId?: string | null,
): Promise<SupplierExtractionContext> {
  if (!supplierId) {
    return { supplier: null, extractionPrompt: null, fieldMappings: {} };
  }

  const supplier = await db.query.suppliers.findFirst({
    where: and(
      eq(suppliers.id, supplierId),
      eq(suppliers.organizationId, organizationId),
    ),
  });

  if (!supplier) {
    return { supplier: null, extractionPrompt: null, fieldMappings: {} };
  }

  return {
    supplier,
    extractionPrompt: supplier.extractionPrompt,
    fieldMappings: parseSupplierFieldMappings(supplier.fieldMappings),
  };
}

export function resolveExtractionSystemPrompt(
  context?: SupplierExtractionContext | null,
): string {
  const prompt = context?.extractionPrompt?.trim();
  if (prompt) return prompt;
  return getDefaultExtractionPrompt();
}

export function supplierHasCustomExtraction(context: SupplierExtractionContext): boolean {
  if (Object.keys(context.fieldMappings).length > 0) return true;

  const prompt = context.extractionPrompt?.trim();
  if (!prompt) return false;

  return prompt !== getDefaultExtractionPrompt().trim();
}

function removeSection(prompt: string, sectionHeader: string): string {
  const headerIndex = prompt.indexOf(sectionHeader);
  if (headerIndex < 0) return prompt.trim();

  const before = prompt.slice(0, headerIndex).trimEnd();
  const afterStart = prompt.slice(headerIndex + sectionHeader.length);
  const nextHeader = afterStart.search(/\n## /);
  const after =
    nextHeader >= 0 ? afterStart.slice(nextHeader + 1).trimStart() : "";

  return [before, after].filter(Boolean).join("\n\n").trim();
}

export function buildMappingsPromptSection(
  mappings: SupplierFieldMappings,
): string | null {
  const mappingLines = Object.entries(mappings)
    .map(([field, mapping]) => {
      if (!mapping?.preferredSource) return null;
      const hint = mapping.label
        ? `"${mapping.label}" (${mapping.preferredSource})`
        : mapping.preferredSource;
      return `- ${field}: prefer value from ${hint}`;
    })
    .filter(Boolean);

  if (mappingLines.length === 0) return null;

  return `${MAPPINGS_SECTION_HEADER}
When populating fieldCandidates and primary fields, prefer these sources:
${mappingLines.join("\n")}`;
}

export function syncMappingsIntoExtractionPrompt(
  prompt: string | null | undefined,
  mappings: SupplierFieldMappings,
): string {
  const base = prompt?.trim() || getDefaultExtractionPrompt();
  const withoutMappings = removeSection(base, MAPPINGS_SECTION_HEADER);
  const mappingsSection = buildMappingsPromptSection(mappings);

  if (!mappingsSection) return withoutMappings;

  return `${withoutMappings}\n\n${mappingsSection}`;
}

export function buildLearnedExtractionPrompt(
  existingPrompt: string | null | undefined,
  field: ValidatableField,
  source: string,
  label: string,
  value: string,
): string {
  const fieldLabel = FIELD_LABELS[field];
  const line = `- For ${fieldLabel}, use the value from "${label}" (${source}), not other parties such as bill-to or ship-to. Example value: "${value}".`;

  const base = existingPrompt?.trim() || getDefaultExtractionPrompt();

  if (base.includes(line)) {
    return base;
  }

  let notesSection = "";
  const notesIndex = base.indexOf(EXTRACTION_NOTES_HEADER);
  if (notesIndex >= 0) {
    const beforeNotes = base.slice(0, notesIndex).trimEnd();
    const afterNotes = base
      .slice(notesIndex + EXTRACTION_NOTES_HEADER.length)
      .trim();
    const noteLines = afterNotes
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => entry && !entry.includes(`For ${fieldLabel},`));

    notesSection = [EXTRACTION_NOTES_HEADER, ...noteLines, line].join("\n");
    return `${beforeNotes}\n\n${notesSection}`.trim();
  }

  return `${base}\n\n${EXTRACTION_NOTES_HEADER}\n${line}`;
}

export async function learnSupplierMappings(params: {
  supplierId: string;
  organizationId: string;
  candidates: ExtractionCandidates | null;
  selectedSources: Partial<Record<ValidatableField, string>>;
  confirmedFields: Partial<Record<ValidatableField, string>>;
}) {
  const supplier = await db.query.suppliers.findFirst({
    where: and(
      eq(suppliers.id, params.supplierId),
      eq(suppliers.organizationId, params.organizationId),
    ),
  });

  if (!supplier) return null;

  const mappings = parseSupplierFieldMappings(supplier.fieldMappings);
  let extractionPrompt = supplier.extractionPrompt ?? getDefaultExtractionPrompt();

  for (const [field, source] of Object.entries(params.selectedSources) as Array<
    [ValidatableField, string]
  >) {
    const confirmedValue = params.confirmedFields[field];
    if (!confirmedValue) continue;

    const candidate = params.candidates?.[field]?.find(
      (entry) => entry.source === source,
    );
    const label = candidate?.label ?? source;

    mappings[field] = {
      preferredSource: source,
      preferredValue: confirmedValue,
      label,
    };

    extractionPrompt = buildLearnedExtractionPrompt(
      extractionPrompt,
      field,
      source,
      label,
      confirmedValue,
    );
  }

  extractionPrompt = syncMappingsIntoExtractionPrompt(extractionPrompt, mappings);

  const [updated] = await db
    .update(suppliers)
    .set({
      fieldMappings: JSON.stringify(mappings),
      extractionPrompt,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, supplier.id))
    .returning();

  return updated;
}

export async function updateSupplierExtractionSettings(params: {
  supplierId: string;
  organizationId: string;
  extractionPrompt?: string | null;
  fieldMappings?: SupplierFieldMappings;
}) {
  const supplier = await db.query.suppliers.findFirst({
    where: and(
      eq(suppliers.id, params.supplierId),
      eq(suppliers.organizationId, params.organizationId),
    ),
  });

  if (!supplier) return null;

  const fieldMappings =
    params.fieldMappings ?? parseSupplierFieldMappings(supplier.fieldMappings);

  let extractionPrompt =
    params.extractionPrompt !== undefined
      ? params.extractionPrompt?.trim() || getDefaultExtractionPrompt()
      : supplier.extractionPrompt ?? getDefaultExtractionPrompt();

  if (params.fieldMappings) {
    extractionPrompt = syncMappingsIntoExtractionPrompt(extractionPrompt, fieldMappings);
  }

  const [updated] = await db
    .update(suppliers)
    .set({
      fieldMappings: JSON.stringify(fieldMappings),
      extractionPrompt,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, supplier.id))
    .returning();

  return updated;
}
