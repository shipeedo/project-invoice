import { eq } from "drizzle-orm";
import { db, invoices, suppliers, type Supplier } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { extractInvoiceFromDocument, parseInvoiceDate } from "@/lib/extraction";
import { resolveDueDate } from "@/lib/trading-terms";
import { createNotification, invoiceSummaryLine } from "@/lib/notifications";
import { assignApproverForInvoice, ensureDefaultRoutingRules } from "@/lib/routing";
import {
  buildNewSupplierValues,
  findMatchingSupplier,
  getSupplierExtractionContext,
  supplierHasCustomExtraction,
  supplierMatchesInvoiceFields,
} from "@/lib/supplier-extraction";

async function resolveSupplierFromExtraction(
  organizationId: string,
  data: {
    vendorName?: string;
    vendorEmail?: string;
  },
) {
  return findMatchingSupplier(organizationId, data.vendorName ?? null, data.vendorEmail);
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
    params.organizationId,
    params.filePath,
    params.fileName,
    params.mimeType,
  );

  const supplier = extraction.data
    ? await resolveSupplierFromExtraction(params.organizationId, {
        vendorName: extraction.data.vendorName,
        vendorEmail: extraction.data.vendorEmail,
      })
    : null;

  if (supplier) {
    const supplierContext = await getSupplierExtractionContext(
      params.organizationId,
      supplier.id,
    );
    if (supplierHasCustomExtraction(supplierContext)) {
      extraction = await extractInvoiceFromDocument(
        params.organizationId,
        params.filePath,
        params.fileName,
        params.mimeType,
        supplierContext,
      );
    }
  }

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
      accountReference: extraction.data?.accountReference ?? null,
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
    subtotalAmount?: number | null;
    taxAmount?: number | null;
    currency?: string;
  };
  supplierId?: string | null;
  createSupplier?: {
    name: string;
    emailAddresses?: string[];
    emailDomains?: string[];
  };
};

/**
 * Decides which supplier record a validated invoice links to.
 *
 * An absent `input.supplierId` cannot mean "keep the existing link": the panel
 * only sends the field when the validator actively picks a supplier, so the
 * validator may instead have retyped the supplier name over an invoice that is
 * still linked to the old company. The link therefore only survives while it
 * still matches the submitted name or email; otherwise it is dropped and
 * re-matched from the submitted fields. An explicitly supplied id (including
 * null, to detach) always wins and is never second-guessed.
 */
async function resolveValidatedSupplierId(
  input: ValidateInvoiceInput,
  invoice: { supplier: Supplier | null },
): Promise<string | null> {
  if (input.supplierId !== undefined) {
    return input.supplierId;
  }

  if (input.createSupplier?.name?.trim()) {
    const name = input.createSupplier.name.trim();
    // Creating is a fallback, not an override. The panel switches itself to
    // "create" whenever the confirmed name matches no supplier *name*, but it
    // only knows names — a supplier matched on its email address or domain
    // would be duplicated if this created one unconditionally.
    const existing = await findMatchingSupplier(
      input.organizationId,
      name,
      input.fields.vendorEmail,
    );
    if (existing) return existing.id;

    const [created] = await db
      .insert(suppliers)
      .values(
        buildNewSupplierValues({
          organizationId: input.organizationId,
          name,
          emailAddresses: input.createSupplier.emailAddresses,
          emailDomains: input.createSupplier.emailDomains,
        }),
      )
      .returning();
    return created.id;
  }

  if (
    invoice.supplier &&
    supplierMatchesInvoiceFields(
      invoice.supplier,
      input.fields.vendorName,
      input.fields.vendorEmail,
    )
  ) {
    return invoice.supplier.id;
  }

  const matched = await findMatchingSupplier(
    input.organizationId,
    input.fields.vendorName,
    input.fields.vendorEmail,
  );
  return matched?.id ?? null;
}

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

  const supplierId = await resolveValidatedSupplierId(input, invoice);

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
      totalAmount: input.fields.totalAmount ?? null,
      subtotalAmount: input.fields.subtotalAmount ?? null,
      taxAmount: input.fields.taxAmount ?? null,
      currency: input.fields.currency?.trim().toUpperCase() || "AUD",
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
      assignedAt: approver ? new Date() : null,
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
      // Recorded so a supplier that changed during validation is traceable
      // afterwards; the invoice row only keeps the final link.
      ...(supplierId !== invoice.supplierId
        ? { previousSupplierId: invoice.supplierId }
        : {}),
      assignedToId: approver?.id,
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

    if (approver.id !== input.userId) {
      await createNotification({
        organizationId: input.organizationId,
        recipientId: approver.id,
        actorId: input.userId,
        invoiceId: input.invoiceId,
        type: "INVOICE_ASSIGNED",
        title: "Invoice assigned to you",
        body: invoiceSummaryLine(routedInvoice),
        auditDetails: { recipientEmail: approver.email, via: "routing" },
      });
    }
  }

  const result = await db.query.invoices.findFirst({
    where: eq(invoices.id, routedInvoice.id),
    with: { supplier: true, assignedTo: true, validatedBy: true },
  });

  return { invoice: result ?? routedInvoice };
}
