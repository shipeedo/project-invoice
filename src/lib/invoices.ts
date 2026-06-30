import { db } from "@/lib/db";
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

  const invoice = await db.invoice.create({
    data: {
      organizationId: params.organizationId,
      status: "PROCESSING",
      sourceType: "UPLOAD",
      originalFileName: params.fileName,
      filePath: params.filePath,
      fileMimeType: params.mimeType,
    },
  });

  await recordAuditEvent({
    invoiceId: invoice.id,
    userId: params.userId,
    action: "invoice.received",
    details: { sourceType: "UPLOAD", fileName: params.fileName },
  });

  const extraction = await extractInvoiceFromPdf(params.filePath, params.fileName);

  const updatedInvoice = await db.invoice.update({
    where: { id: invoice.id },
    data: {
      vendorName: extraction.data?.vendorName,
      vendorEmail: extraction.data?.vendorEmail ?? undefined,
      invoiceNumber: extraction.data?.invoiceNumber,
      invoiceDate: parseInvoiceDate(extraction.data?.invoiceDate),
      totalAmount: extraction.data?.totalAmount,
      currency: extraction.data?.currency ?? "AUD",
      lineItems: extraction.data?.lineItems
        ? JSON.stringify(extraction.data.lineItems)
        : null,
      extractionRaw: extraction.raw ? JSON.stringify(extraction.raw) : null,
      parseError: extraction.error,
      status: extraction.error ? "NEEDS_REVIEW" : "PENDING_APPROVAL",
    },
  });

  const approver = await assignApproverForInvoice(
    params.organizationId,
    updatedInvoice,
  );

  const routedInvoice = await db.invoice.update({
    where: { id: invoice.id },
    data: {
      assignedToId: approver?.id,
      status: approver ? updatedInvoice.status : "NEEDS_REVIEW",
    },
    include: {
      assignedTo: true,
    },
  });

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

  return routedInvoice;
}
