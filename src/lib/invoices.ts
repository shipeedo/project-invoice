import { and, eq } from "drizzle-orm";
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
import { sharedEmailProvider, supplierEmailDomain } from "@/lib/supplier-matching";

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

export type LinkInvoiceSupplierInput = {
  organizationId: string;
  userId: string;
  invoiceId: string;
  vendorName: string;
  vendorEmail?: string | null;
  /** An existing supplier the reviewer picked or confirmed as the match. */
  supplierId?: string;
  /** Create a new supplier from the confirmed name and email. */
  createSupplier?: boolean;
};

/**
 * Settles which supplier a draft invoice belongs to, before it is validated and
 * routed for approval.
 *
 * Deliberately a step of its own: the reviewer confirms who sent the invoice
 * first, and the link is persisted there and then, so nothing about the
 * supplier is still in flight by the time an approver is picked — routing rules
 * and trading terms both read the linked record.
 */
export async function linkInvoiceSupplier(input: LinkInvoiceSupplierInput) {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, input.invoiceId),
  });

  if (!invoice || invoice.organizationId !== input.organizationId) {
    return { error: "Not found" as const };
  }

  if (invoice.status !== "DRAFT") {
    return { error: "Invoice is not awaiting validation" as const };
  }

  const vendorName = input.vendorName?.trim();
  if (!vendorName) {
    return { error: "Supplier name is required" as const };
  }
  const vendorEmail = input.vendorEmail?.trim() || null;

  let supplier: Supplier | null = null;
  let created = false;

  if (input.supplierId) {
    supplier =
      (await db.query.suppliers.findFirst({
        where: and(
          eq(suppliers.id, input.supplierId),
          eq(suppliers.organizationId, input.organizationId),
        ),
      })) ?? null;
    if (!supplier) {
      return { error: "Supplier not found" as const };
    }
  } else if (input.createSupplier) {
    // Creating stays the fallback even when it is asked for outright: the
    // screen ranks matches on the name and email it can see, so a supplier
    // reachable on a domain it cannot would otherwise be duplicated here.
    supplier = await findMatchingSupplier(input.organizationId, vendorName, vendorEmail);
    if (!supplier) {
      // Contact details are only worth recording when they identify this
      // supplier alone. Xero and MYOB relay every customer's invoices from one
      // address — `messaging-service@post.xero.com` fronts four different
      // suppliers in our own data — so keeping either the address or its
      // domain would match all of their later invoices to whichever supplier
      // was created first. The invoice still records who actually sent it.
      const ownAddress = vendorEmail && !sharedEmailProvider(vendorEmail);
      const domain = supplierEmailDomain(vendorEmail);
      const [row] = await db
        .insert(suppliers)
        .values(
          buildNewSupplierValues({
            organizationId: input.organizationId,
            name: vendorName,
            emailAddresses: ownAddress ? [vendorEmail] : [],
            emailDomains: domain ? [domain] : [],
          }),
        )
        .returning();
      supplier = row;
      created = true;
    }
  } else {
    return { error: "Pick a supplier to link, or create one" as const };
  }

  await db
    .update(invoices)
    .set({
      vendorName,
      vendorEmail,
      supplierId: supplier.id,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id));

  await recordAuditEvent({
    invoiceId: invoice.id,
    userId: input.userId,
    action: "invoice.supplier_linked",
    details: {
      supplierId: supplier.id,
      supplierName: supplier.name,
      created,
      ...(invoice.supplierId && invoice.supplierId !== supplier.id
        ? { previousSupplierId: invoice.supplierId }
        : {}),
    },
  });

  return { supplier, created };
}

export type ChangeInvoiceSupplierInput = {
  organizationId: string;
  userId: string;
  invoiceId: string;
  supplierId: string;
};

/**
 * Re-points an invoice at a different supplier, after the draft flow is done.
 *
 * A correction rather than a step of the workflow: extraction (or the reviewer)
 * matched the wrong company, and someone spotted it later — often once the
 * invoice is already approved. The extracted vendor name and email stay as they
 * were read off the document, since they are the evidence for who actually sent
 * it, and the approver already decided on this invoice as it stands.
 *
 * The due date is the exception, because it is derived rather than read: it is
 * recomputed from the new supplier's trading terms, the same way validation and
 * re-processing derive it, so it can never be a date the old supplier's terms
 * produced while the screen credits it to the new supplier's.
 */
export async function changeInvoiceSupplier(input: ChangeInvoiceSupplierInput) {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, input.invoiceId),
    with: { supplier: { columns: { id: true, name: true } } },
  });

  if (!invoice || invoice.organizationId !== input.organizationId) {
    return { error: "Not found" as const };
  }

  if (invoice.deletedAt) {
    return { error: "Restore this invoice before changing its supplier" as const };
  }

  // Drafts settle their supplier through linkInvoiceSupplier, which also
  // reconciles the vendor fields the validation screen is still editing.
  if (invoice.status === "DRAFT") {
    return { error: "Confirm the supplier from the validation panel" as const };
  }

  if (invoice.status === "CANCELLED") {
    return { error: "Cancelled invoices cannot be changed" as const };
  }

  const supplier =
    (await db.query.suppliers.findFirst({
      where: and(
        eq(suppliers.id, input.supplierId),
        eq(suppliers.organizationId, input.organizationId),
      ),
    })) ?? null;

  if (!supplier) {
    return { error: "Supplier not found" as const };
  }

  if (invoice.supplierId === supplier.id) {
    return { supplier, changed: false as const };
  }

  // originalDueDate holds the document's own due date whenever trading terms
  // replaced it, so it is the stated date to re-derive from; otherwise the
  // stored due date is still the stated one.
  const resolvedDueDate = resolveDueDate({
    invoiceDate: invoice.invoiceDate,
    extractedDueDate: invoice.originalDueDate ?? invoice.dueDate,
    tradingTermDays: supplier.tradingTermDays,
  });

  await db
    .update(invoices)
    .set({
      supplierId: supplier.id,
      dueDate: resolvedDueDate.dueDate,
      originalDueDate: resolvedDueDate.originalDueDate,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id));

  await recordAuditEvent({
    invoiceId: invoice.id,
    userId: input.userId,
    action: "invoice.supplier_changed",
    details: {
      supplierId: supplier.id,
      supplierName: supplier.name,
      previousSupplierId: invoice.supplierId,
      previousSupplierName: invoice.supplier?.name ?? null,
      ...(resolvedDueDate.dueDate?.getTime() !== invoice.dueDate?.getTime()
        ? {
            previousDueDate: invoice.dueDate?.toISOString() ?? null,
            dueDate: resolvedDueDate.dueDate?.toISOString() ?? null,
            tradingTermDays: resolvedDueDate.tradingTermDays,
          }
        : {}),
    },
  });

  return { supplier, changed: true as const };
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
};

/**
 * Decides which supplier record a validated invoice links to.
 *
 * Suppliers are settled by linkInvoiceSupplier before this runs, so the usual
 * path is the id the screen submits back, which always wins. An absent
 * `input.supplierId` cannot mean "keep the existing link": a caller may instead
 * have retyped the supplier name over an invoice that is still linked to the
 * old company. The link therefore only survives while it still matches the
 * submitted name or email; otherwise it is dropped and re-matched from the
 * submitted fields.
 */
async function resolveValidatedSupplierId(
  input: ValidateInvoiceInput,
  invoice: { supplier: Supplier | null },
): Promise<string | null> {
  if (input.supplierId !== undefined) {
    return input.supplierId;
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

  // Approval routing and trading terms both read the supplier, so an invoice
  // cannot leave DRAFT without one — the link is settled in its own step first.
  if (!supplierId) {
    return { error: "Link a supplier before routing for approval" as const };
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
