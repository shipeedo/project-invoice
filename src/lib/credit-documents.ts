// Mirrors files that enter through the credit workflow into the invoice
// Documents section (invoice_documents rows of kind CREDIT), so credit
// attachments and received credit notes show up alongside other documents.

import { db, invoiceDocuments, notes } from "@/lib/db";

export type CreditDocumentFile = {
  fileName: string;
  filePath: string;
  mimeType?: string | null;
  size?: number | null;
};

export async function addCreditDocuments(params: {
  organizationId: string;
  invoiceId: string;
  /** Null for mailto drafts, which have no credit request row yet. */
  creditRequestId?: string | null;
  uploadedById: string;
  files: CreditDocumentFile[];
  /**
   * Optional note shown in the invoice Notes sidebar, linked to the first
   * created document when there is one.
   */
  note?: string | null;
}) {
  const created: (typeof invoiceDocuments.$inferSelect)[] = [];
  for (const file of params.files) {
    const [document] = await db
      .insert(invoiceDocuments)
      .values({
        organizationId: params.organizationId,
        invoiceId: params.invoiceId,
        creditRequestId: params.creditRequestId ?? null,
        uploadedById: params.uploadedById,
        fileName: file.fileName,
        filePath: file.filePath,
        mimeType: file.mimeType ?? null,
        size: file.size ?? null,
        kind: "CREDIT",
      })
      .returning();
    created.push(document);
  }

  const noteContent = params.note?.trim();
  if (noteContent) {
    await db.insert(notes).values({
      invoiceId: params.invoiceId,
      documentId: created[0]?.id ?? null,
      userId: params.uploadedById,
      content: noteContent,
    });
  }

  return created;
}
