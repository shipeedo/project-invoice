import { and, eq } from "drizzle-orm";
import { db, suppliers, type Supplier } from "@/lib/db";
import { INVOICE_EXTRACTION_SYSTEM_PROMPT } from "@/lib/extraction-prompts";
import { normalizeTradingTermDays } from "@/lib/trading-terms";

export type SupplierExtractionContext = {
  supplier: Supplier | null;
  extractionPrompt: string | null;
};

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
    // Null means "use the current default prompt" — storing a copy would pin
    // the supplier to whatever the default was at creation time.
    extractionPrompt: null,
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

/**
 * True when a supplier record still corresponds to the given name/email — the
 * same test findMatchingSupplier uses to pick a supplier in the first place.
 *
 * Used to decide whether an already-linked supplier survives a change to the
 * invoice's vendor fields. A link kept past the point where it would no longer
 * be found leaves surfaces that read `supplier.name` (the queue table) naming a
 * different company than surfaces that read `vendorName` (the header).
 */
export function supplierMatchesInvoiceFields(
  supplier: Supplier,
  vendorName?: string | null,
  vendorEmail?: string | null,
): boolean {
  if (vendorEmail && supplierMatchesEmail(supplier, vendorEmail)) return true;
  if (vendorName && supplierMatchesName(supplier, vendorName)) return true;
  return false;
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
    return { supplier: null, extractionPrompt: null };
  }

  const supplier = await db.query.suppliers.findFirst({
    where: and(
      eq(suppliers.id, supplierId),
      eq(suppliers.organizationId, organizationId),
    ),
  });

  if (!supplier) {
    return { supplier: null, extractionPrompt: null };
  }

  return {
    supplier,
    extractionPrompt: supplier.extractionPrompt,
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
  const prompt = context.extractionPrompt?.trim();
  if (!prompt) return false;

  return prompt !== getDefaultExtractionPrompt().trim();
}

export async function updateSupplierExtractionSettings(params: {
  supplierId: string;
  organizationId: string;
  extractionPrompt?: string | null;
}) {
  const supplier = await db.query.suppliers.findFirst({
    where: and(
      eq(suppliers.id, params.supplierId),
      eq(suppliers.organizationId, params.organizationId),
    ),
  });

  if (!supplier) return null;

  const extractionPrompt =
    params.extractionPrompt !== undefined
      ? params.extractionPrompt?.trim() || null
      : supplier.extractionPrompt;

  const [updated] = await db
    .update(suppliers)
    .set({
      extractionPrompt,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, supplier.id))
    .returning();

  return updated;
}
