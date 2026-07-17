// Source files behind an invoice: the email attachments when the invoice came
// in by mail, or the single uploaded file otherwise. Shared by the invoice
// detail page and the queue's Documents column.

export type SourceAttachment = {
  key: string;
  fileName: string;
  href: string;
  previewHref: string;
  mimeType?: string | null;
  filePath: string | null;
  size: number | null;
  isPrimary: boolean;
};

export function getSourceAttachments(invoice: {
  id: string;
  filePath: string | null;
  fileMimeType: string | null;
  originalFileName: string | null;
  attachments: Array<{
    id: string;
    fileName: string;
    filePath: string;
    mimeType: string | null;
    size: number | null;
    isPrimary: boolean | null;
  }>;
}): SourceAttachment[] {
  if (invoice.attachments.length > 0) {
    return invoice.attachments.map((attachment) => ({
      key: attachment.id,
      fileName: attachment.fileName,
      href: `/api/invoices/${invoice.id}/attachments/${attachment.id}`,
      previewHref: `/api/invoices/${invoice.id}/preview?attachmentId=${attachment.id}`,
      mimeType: attachment.mimeType,
      filePath: attachment.filePath,
      size: attachment.size,
      isPrimary: attachment.isPrimary ?? false,
    }));
  }

  if (invoice.filePath) {
    return [
      {
        key: "primary-file",
        fileName: invoice.originalFileName ?? "Attachment",
        href: `/api/invoices/${invoice.id}/file`,
        previewHref: `/api/invoices/${invoice.id}/preview?file=1`,
        mimeType: invoice.fileMimeType,
        filePath: invoice.filePath,
        size: null,
        isPrimary: true,
      },
    ];
  }

  return [];
}
