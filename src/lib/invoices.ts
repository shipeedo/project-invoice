import { eq } from "drizzle-orm";
import { db, invoices } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import {
  extractInvoiceFromPdf,
  parseInvoiceDate,
} from "@/lib/extraction";
import { assignApproverForInvoice, ensureDefaultRoutingRules } from "@/lib/routing";

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

  const extraction = await extractInvoiceFromPdf(params.filePath, params.fileName);

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
      extractionRaw: extraction.raw ? JSON.stringify(extraction.raw) : null,
      parseError: extraction.error ?? null,
      status: extraction.error ? "NEEDS_REVIEW" : "PENDING_APPROVAL",
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id))
    .returning();

  const approver = await assignApproverForInvoice(
    params.organizationId,
    updatedInvoice,
  );

  const [routedInvoice] = await db
    .update(invoices)
    .set({
      assignedToId: approver?.id ?? null,
      status: approver ? updatedInvoice.status : "NEEDS_REVIEW",
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
      assignedToId: approver?.id,
    },
  });

  if (approver) {
    await recordAuditEvent({
      invoiceId: invoice.id,
      userId: params.userId,
      action: "invoice.routed",
      details: { assignedToId: approver.id, assignedToEmail: approver.email },
    });
  }

  const withApprover = await db.query.invoices.findFirst({
    where: eq(invoices.id, routedInvoice.id),
    with: { assignedTo: true },
  });

  return withApprover ?? routedInvoice;
}
