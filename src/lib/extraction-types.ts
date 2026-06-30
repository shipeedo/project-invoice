export type FieldCandidate = {
  value: string;
  label: string;
  source: string;
};

export type ExtractionCandidates = {
  vendorName?: FieldCandidate[];
  vendorEmail?: FieldCandidate[];
  invoiceNumber?: FieldCandidate[];
  invoiceDate?: FieldCandidate[];
  dueDate?: FieldCandidate[];
  totalAmount?: FieldCandidate[];
  currency?: FieldCandidate[];
};

export type ValidatableField = keyof ExtractionCandidates;

export type SupplierFieldMapping = {
  preferredSource: string;
  preferredValue?: string;
  label?: string;
};

export type SupplierFieldMappings = Partial<
  Record<ValidatableField, SupplierFieldMapping>
>;

export const VALIDATABLE_FIELDS: ValidatableField[] = [
  "vendorName",
  "vendorEmail",
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "totalAmount",
  "currency",
];

export const FIELD_LABELS: Record<ValidatableField, string> = {
  vendorName: "supplier / vendor name",
  vendorEmail: "supplier email",
  invoiceNumber: "invoice number",
  invoiceDate: "invoice date",
  dueDate: "due date",
  totalAmount: "invoice total",
  currency: "currency",
};

export function parseExtractionCandidates(
  raw: string | null | undefined,
): ExtractionCandidates | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExtractionCandidates;
  } catch {
    return null;
  }
}

export function parseSupplierFieldMappings(
  raw: string | null | undefined,
): SupplierFieldMappings {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SupplierFieldMappings;
  } catch {
    return {};
  }
}
