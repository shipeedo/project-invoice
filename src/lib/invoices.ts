import { eq } from "drizzle-orm";
import { db, invoices, suppliers } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import {
  extractInvoiceFromDocument,
  parseInvoiceDate,
  type ExtractedLineItem,
} from "@/lib/extraction";
import {
  applyRejectedLineIndexes,
  mergeLineItemAssignments,
  parseLineItems,
  resolveLineItemStatus,
} from "@/lib/line-items";
import {
  computeLineItemTotals,
  type InvoiceTotalsSource,
} from "@/lib/invoice-totals";
import type { ExtractionCandidates, ValidatableField } from "@/lib/extraction-types";
import { resolveDueDate } from "@/lib/trading-terms";
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
      status: "DRAFT",
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

  let extraction = await extractInvoiceFromDocument(
    params.filePath,
    params.fileName,
    params.mimeType,
  );

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
      extraction = await extractInvoiceFromDocument(
        params.filePath,
        params.fileName,
        params.mimeType,
        supplierContext,
      );
    }
  }

  const fieldCandidates =
    extraction.fieldCandidates ?? extraction.data?.fieldCandidates ?? null;

  const resolvedDueDate = resolveDueDate({
    invoiceDate: parseInvoiceDate(extraction.data?.invoiceDate),
    extractedDueDate: parseInvoiceDate(extraction.data?.dueDate),
    tradingTermDays: supplier?.tradingTermDays,
  });

  const [updatedInvoice] = await db
    .update(invoices)
    .set({
      vendorName: extraction.data?.vendorName,
      vendorEmail: extraction.data?.vendorEmail ?? null,
      invoiceNumber: extraction.data?.invoiceNumber,
      invoiceDate: parseInvoiceDate(extraction.data?.invoiceDate),
      dueDate: resolvedDueDate.dueDate,
      originalDueDate: resolvedDueDate.originalDueDate,
      respondByDate: parseInvoiceDate(extraction.data?.respondByDate),
      totalAmount: extraction.data?.totalAmount,
      subtotalAmount: extraction.data?.subtotal,
      taxAmount: extraction.data?.taxAmount,
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
      status: "DRAFT",
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

  if (resolvedDueDate.overridden) {
    await recordAuditEvent({
      invoiceId: invoice.id,
      userId: params.userId,
      action: "invoice.due_date_overridden",
      details: {
        supplierId: supplier?.id,
        tradingTermDays: resolvedDueDate.tradingTermDays,
        originalDueDate: resolvedDueDate.originalDueDate?.toISOString() ?? null,
        dueDate: resolvedDueDate.dueDate?.toISOString() ?? null,
      },
    });
  }

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
    respondByDate?: string | null;
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
  /** Line indexes deselected during validation; marked REJECTED on confirm. */
  rejectedLineIndexes?: number[];
  /** Which totals to save: the extracted document totals (default) or totals computed from the selected line items. */
  totalsSource?: InvoiceTotalsSource;
};

export async function validateInvoice(input: ValidateInvoiceInput) {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, input.invoiceId),
    with: { supplier: true },
  });

  if (!invoice || invoice.organizationId !== input.organizationId) {
    return { error: "Not found" as const };
  }

  if (invoice.status !== "DRAFT") {
    return { error: "Invoice is not awaiting validation" as const };
  }

  if (!input.fields.vendorName?.trim()) {
    return { error: "Supplier name is required" as const };
  }

  const mergedLineItems = input.lineItems
    ? mergeLineItemAssignments(parseLineItems(invoice.lineItems), input.lineItems)
    : parseLineItems(invoice.lineItems);
  const rejectedLineIndexes = [...new Set(input.rejectedLineIndexes ?? [])].filter(
    (index) => index >= 0 && index < mergedLineItems.length,
  );

  if (
    mergedLineItems.length > 0 &&
    rejectedLineIndexes.length >= mergedLineItems.length
  ) {
    return { error: "At least one line item must be selected" as const };
  }

  const nextLineItems = applyRejectedLineIndexes(mergedLineItems, rejectedLineIndexes);

  const totalsSource = input.totalsSource ?? "DOCUMENT";
  const lineItemTotals = computeLineItemTotals(
    nextLineItems.filter((item) => resolveLineItemStatus(item) !== "REJECTED"),
  );

  if (totalsSource === "LINE_ITEMS" && lineItemTotals.total == null) {
    return {
      error: "Selected line items have no amounts to calculate totals from" as const,
    };
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
        respondByDate: input.fields.respondByDate || undefined,
        totalAmount:
          input.fields.totalAmount != null
            ? String(input.fields.totalAmount)
            : undefined,
        currency: input.fields.currency?.trim() || undefined,
      },
    });
  }

  const supplierTradingTermDays = supplierId
    ? invoice.supplier?.id === supplierId
      ? invoice.supplier.tradingTermDays
      : ((
          await db.query.suppliers.findFirst({
            where: eq(suppliers.id, supplierId),
            columns: { tradingTermDays: true },
          })
        )?.tradingTermDays ?? null)
    : null;

  // The due date field may already hold a value overridden by trading terms at
  // extraction time, so prefer the document's stated due date captured then.
  const statedDueDate =
    invoice.originalDueDate ?? parseInvoiceDate(input.fields.dueDate);
  const resolvedDueDate = resolveDueDate({
    invoiceDate: parseInvoiceDate(input.fields.invoiceDate),
    extractedDueDate: statedDueDate,
    tradingTermDays: supplierTradingTermDays,
  });

  const [validatedInvoice] = await db
    .update(invoices)
    .set({
      vendorName: input.fields.vendorName.trim(),
      vendorEmail: input.fields.vendorEmail?.trim() || null,
      invoiceNumber: input.fields.invoiceNumber?.trim() || null,
      invoiceDate: parseInvoiceDate(input.fields.invoiceDate),
      dueDate: resolvedDueDate.dueDate,
      originalDueDate: resolvedDueDate.originalDueDate,
      respondByDate: parseInvoiceDate(input.fields.respondByDate),
      // DOCUMENT keeps the extracted subtotal/tax on the invoice untouched;
      // LINE_ITEMS overwrites all three totals with values computed from the
      // lines still selected.
      ...(totalsSource === "LINE_ITEMS"
        ? {
            totalAmount: lineItemTotals.total,
            subtotalAmount: lineItemTotals.subtotal,
            taxAmount: lineItemTotals.taxAmount,
          }
        : { totalAmount: input.fields.totalAmount ?? null }),
      currency: input.fields.currency?.trim().toUpperCase() || "AUD",
      lineItems:
        input.lineItems || rejectedLineIndexes.length > 0
          ? JSON.stringify(nextLineItems)
          : invoice.lineItems,
      supplierId,
      validatedAt: new Date(),
      validatedById: input.userId,
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
      // An invoice only leaves DRAFT once it has an assignee.
      status: approver ? "PENDING_APPROVAL" : "DRAFT",
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
      totalsSource,
      ...(totalsSource === "LINE_ITEMS" ? { totals: lineItemTotals } : {}),
      ...(rejectedLineIndexes.length > 0
        ? {
            rejectedLineIndexes,
            rejectedLineCount: rejectedLineIndexes.length,
          }
        : {}),
    },
  });

  // Only log the override when validation actually changed the due date (e.g. a
  // newly assigned supplier or edited invoice date), not when it merely
  // re-confirms an override already applied and logged at extraction time.
  const dueDateChanged =
    (resolvedDueDate.dueDate?.getTime() ?? null) !==
    (invoice.dueDate?.getTime() ?? null);
  if (resolvedDueDate.overridden && dueDateChanged) {
    await recordAuditEvent({
      invoiceId: input.invoiceId,
      userId: input.userId,
      action: "invoice.due_date_overridden",
      details: {
        supplierId,
        tradingTermDays: resolvedDueDate.tradingTermDays,
        originalDueDate: resolvedDueDate.originalDueDate?.toISOString() ?? null,
        dueDate: resolvedDueDate.dueDate?.toISOString() ?? null,
      },
    });
  }

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
