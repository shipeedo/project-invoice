import { eq } from "drizzle-orm";
import { db, invoices, suppliers } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import {
  extractInvoiceFromPdf,
  parseInvoiceDate,
  type ExtractedLineItem,
} from "@/lib/extraction";
import type { ExtractionCandidates, ValidatableField } from "@/lib/extraction-types";
import { assignApproverForInvoice, ensureDefaultRoutingRules } from "@/lib/routing";
import {
  buildNewSupplierValues,
  findMatchingSupplier,
  getSupplierExtractionContext,
  learnSupplierMappings,
  supplierHasCustomExtraction,
} from "@/lib/supplier-extraction";

async function resolveSupplierFromExtraction(
  organizationId: string,
  data: {
    vendorName?: string;
    vendorEmail?: string;
    fieldCandidates?: ExtractionCandidates | null;
  },
) {
  const names = [
    data.vendorName,
    ...(data.fieldCandidates?.vendorName ?? []).map((candidate) => candidate.value),
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const name of names) {
    const supplier = await findMatchingSupplier(
      organizationId,
      name,
      data.vendorEmail,
    );
    if (supplier) return supplier;
  }

  return findMatchingSupplier(organizationId, null, data.vendorEmail);
}

export async function processUploadedInvoice(params: {
  organizationId: string;
  userId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
}) {
  await ensureDefaultRoutingRules(params.organizationId);

  const [invoice] = await db
    .insert(invoices)
    .values({
      organizationId: params.organizationId,
      status: "PROCESSING",
      sourceType: "UPLOAD",
      originalFileName: params.fileName,
      filePath: params.filePath,
      fileMimeType: params.mimeType,
    })
    .returning();

  await recordAuditEvent({
    invoiceId: invoice.id,
    userId: params.userId,
    action: "invoice.received",
    details: { sourceType: "UPLOAD", fileName: params.fileName },
  });

  let extraction = await extractInvoiceFromPdf(params.filePath, params.fileName);

  const supplier = extraction.data
    ? await resolveSupplierFromExtraction(params.organizationId, {
        vendorName: extraction.data.vendorName,
        vendorEmail: extraction.data.vendorEmail,
        fieldCandidates:
          extraction.fieldCandidates ?? extraction.data.fieldCandidates ?? null,
      })
    : null;

  if (supplier) {
    const supplierContext = await getSupplierExtractionContext(
      params.organizationId,
      supplier.id,
    );
    if (supplierHasCustomExtraction(supplierContext)) {
      extraction = await extractInvoiceFromPdf(
        params.filePath,
        params.fileName,
        supplierContext,
      );
    }
  }

  const fieldCandidates =
    extraction.fieldCandidates ?? extraction.data?.fieldCandidates ?? null;

  const [updatedInvoice] = await db
    .update(invoices)
    .set({
      vendorName: extraction.data?.vendorName,
      vendorEmail: extraction.data?.vendorEmail ?? null,
      invoiceNumber: extraction.data?.invoiceNumber,
      invoiceDate: parseInvoiceDate(extraction.data?.invoiceDate),
      dueDate: parseInvoiceDate(extraction.data?.dueDate),
      totalAmount: extraction.data?.totalAmount,
      currency: extraction.data?.currency ?? "AUD",
      lineItems: extraction.data?.lineItems
        ? JSON.stringify(extraction.data.lineItems)
        : null,
      extractionCandidates: fieldCandidates
        ? JSON.stringify(fieldCandidates)
        : null,
      extractionRaw: extraction.raw ? JSON.stringify(extraction.raw) : null,
      parseError: extraction.error ?? null,
      supplierId: supplier?.id ?? null,
      status: extraction.error ? "NEEDS_REVIEW" : "PENDING_VALIDATION",
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id))
    .returning();

  await recordAuditEvent({
    invoiceId: invoice.id,
    userId: params.userId,
    action: extraction.error ? "invoice.parse_failed" : "invoice.extracted",
    details: {
      parseError: extraction.error,
      supplierId: supplier?.id,
      pendingValidation: !extraction.error,
    },
  });

  const withSupplier = await db.query.invoices.findFirst({
    where: eq(invoices.id, updatedInvoice.id),
    with: { supplier: true, assignedTo: true },
  });

  return withSupplier ?? updatedInvoice;
}

export type ValidateInvoiceInput = {
  organizationId: string;
  userId: string;
  invoiceId: string;
  fields: {
    vendorName: string;
    vendorEmail?: string | null;
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    dueDate?: string | null;
    totalAmount?: number | null;
    currency?: string;
  };
  lineItems?: ExtractedLineItem[];
  supplierId?: string | null;
  createSupplier?: {
    name: string;
    emailAddresses?: string[];
    emailDomains?: string[];
  };
  selectedSources?: Partial<Record<ValidatableField, string>>;
};

export async function validateInvoice(input: ValidateInvoiceInput) {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, input.invoiceId),
    with: { supplier: true },
  });

  if (!invoice || invoice.organizationId !== input.organizationId) {
    return { error: "Not found" as const };
  }

  if (!["PENDING_VALIDATION", "NEEDS_REVIEW"].includes(invoice.status)) {
    return { error: "Invoice is not awaiting validation" as const };
  }

  if (!input.fields.vendorName?.trim()) {
    return { error: "Supplier name is required" as const };
  }

  let supplierId = input.supplierId ?? invoice.supplierId;

  if (!supplierId && input.createSupplier?.name?.trim()) {
    const [created] = await db
      .insert(suppliers)
      .values(
        buildNewSupplierValues({
          organizationId: input.organizationId,
          name: input.createSupplier.name.trim(),
          emailAddresses: input.createSupplier.emailAddresses,
          emailDomains: input.createSupplier.emailDomains,
        }),
      )
      .returning();
    supplierId = created.id;
  }

  if (!supplierId) {
    const matched = await findMatchingSupplier(
      input.organizationId,
      input.fields.vendorName,
      input.fields.vendorEmail,
    );
    supplierId = matched?.id ?? null;
  }

  const candidates = invoice.extractionCandidates
    ? (JSON.parse(invoice.extractionCandidates) as ExtractionCandidates)
    : null;

  if (supplierId && input.selectedSources) {
    await learnSupplierMappings({
      supplierId,
      organizationId: input.organizationId,
      candidates,
      selectedSources: input.selectedSources,
      confirmedFields: {
        vendorName: input.fields.vendorName.trim(),
        vendorEmail: input.fields.vendorEmail?.trim() || undefined,
        invoiceNumber: input.fields.invoiceNumber?.trim() || undefined,
        invoiceDate: input.fields.invoiceDate || undefined,
        dueDate: input.fields.dueDate || undefined,
        totalAmount:
          input.fields.totalAmount != null
            ? String(input.fields.totalAmount)
            : undefined,
        currency: input.fields.currency?.trim() || undefined,
      },
    });
  }

  const [validatedInvoice] = await db
    .update(invoices)
    .set({
      vendorName: input.fields.vendorName.trim(),
      vendorEmail: input.fields.vendorEmail?.trim() || null,
      invoiceNumber: input.fields.invoiceNumber?.trim() || null,
      invoiceDate: parseInvoiceDate(input.fields.invoiceDate),
      dueDate: parseInvoiceDate(input.fields.dueDate),
      totalAmount: input.fields.totalAmount ?? null,
      currency: input.fields.currency?.trim().toUpperCase() || "AUD",
      lineItems: input.lineItems ? JSON.stringify(input.lineItems) : invoice.lineItems,
      supplierId,
      validatedAt: new Date(),
      validatedById: input.userId,
      status: "PENDING_APPROVAL",
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, input.invoiceId))
    .returning();

  const approver = await assignApproverForInvoice(
    input.organizationId,
    validatedInvoice,
  );

  const [routedInvoice] = await db
    .update(invoices)
    .set({
      assignedToId: approver?.id ?? null,
      status: approver ? "PENDING_APPROVAL" : "NEEDS_REVIEW",
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, input.invoiceId))
    .returning();

  await recordAuditEvent({
    invoiceId: input.invoiceId,
    userId: input.userId,
    action: "invoice.validated",
    details: {
      supplierId,
      selectedSources: input.selectedSources,
      assignedToId: approver?.id,
    },
  });

  if (approver) {
    await recordAuditEvent({
      invoiceId: input.invoiceId,
      userId: input.userId,
      action: "invoice.routed",
      details: { assignedToId: approver.id, assignedToEmail: approver.email },
    });
  }

  const result = await db.query.invoices.findFirst({
    where: eq(invoices.id, routedInvoice.id),
    with: { supplier: true, assignedTo: true, validatedBy: true },
  });

  return { invoice: result ?? routedInvoice };
}
