import { and, eq } from "drizzle-orm";
import { db, suppliers, type Supplier } from "@/lib/db";
import type {
  ExtractionCandidates,
  SupplierFieldMappings,
  ValidatableField,
} from "@/lib/extraction-types";
import { parseSupplierFieldMappings } from "@/lib/extraction-types";

export type SupplierExtractionContext = {
  supplier: Supplier | null;
  extractionPrompt: string | null;
  fieldMappings: SupplierFieldMappings;
};

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

export function buildSupplierPromptSection(
  context: SupplierExtractionContext,
): string | null {
  const sections: string[] = [];

  if (context.extractionPrompt?.trim()) {
    sections.push(
      `## Supplier-specific instructions (${context.supplier?.name ?? "known supplier"})\n${context.extractionPrompt.trim()}`,
    );
  }

  const mappingLines = Object.entries(context.fieldMappings)
    .map(([field, mapping]) => {
      if (!mapping?.preferredSource) return null;
      const hint = mapping.label
        ? `"${mapping.label}" (${mapping.preferredSource})`
        : mapping.preferredSource;
      return `- ${field}: prefer value from ${hint}`;
    })
    .filter(Boolean);

  if (mappingLines.length > 0) {
    sections.push(
      `## Learned field mappings for this supplier\nWhen populating fieldCandidates and primary fields, prefer these sources:\n${mappingLines.join("\n")}`,
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : null;
}

const FIELD_LABELS: Record<ValidatableField, string> = {
  vendorName: "supplier / vendor name",
  vendorEmail: "supplier email",
  invoiceNumber: "invoice number",
  invoiceDate: "invoice date",
  dueDate: "due date",
  totalAmount: "invoice total",
  currency: "currency",
};

export function buildLearnedExtractionPrompt(
  existingPrompt: string | null | undefined,
  field: ValidatableField,
  source: string,
  label: string,
  value: string,
): string {
  const fieldLabel = FIELD_LABELS[field];
  const line = `- For ${fieldLabel}, use the value from "${label}" (${source}), not other parties such as bill-to or ship-to. Example value: "${value}".`;

  const header = `Extraction notes for this supplier's invoices:`;
  const base = existingPrompt?.trim() ?? header;

  if (base.includes(line)) {
    return base;
  }

  const withoutOldFieldLine = base
    .split("\n")
    .filter((entry) => !entry.includes(`For ${fieldLabel},`))
    .join("\n")
    .trim();

  return [withoutOldFieldLine || header, line].filter(Boolean).join("\n");
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
  let extractionPrompt = supplier.extractionPrompt;

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
