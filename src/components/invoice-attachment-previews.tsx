import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { readSpreadsheetPreview } from "@/lib/attachment-preview";
import { classifyAttachment, isInvoiceLikeAttachment } from "@/lib/attachment-types";

export type PreviewAttachment = {
  key: string;
  fileName: string;
  href: string;
  mimeType?: string | null;
  filePath: string | null;
  isPrimary: boolean;
};

function OpenInNewTabLink({ attachment }: { attachment: PreviewAttachment }) {
  return (
    <a
      href={attachment.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      Open in new tab
      <ExternalLinkIcon className="size-3" />
    </a>
  );
}

function FallbackRow({ attachment }: { attachment: PreviewAttachment }) {
  return (
    <a
      href={attachment.href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-2.5 py-2 transition-colors hover:bg-muted/70"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background">
        <FileTextIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{attachment.fileName}</p>
        <p className="text-xs text-muted-foreground">
          Preview not available · Open in new tab
        </p>
      </div>
      <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

async function SpreadsheetPreviewBlock({
  attachment,
}: {
  attachment: PreviewAttachment;
}) {
  const preview = attachment.filePath
    ? await readSpreadsheetPreview(
        attachment.filePath,
        attachment.fileName,
        attachment.mimeType,
      )
    : null;

  if (!preview) {
    return <FallbackRow attachment={attachment} />;
  }

  return (
    <div className="space-y-3">
      {preview.sheets.map((sheet) => (
        <div key={sheet.name} className="overflow-hidden rounded-lg border">
          {/* Plain table (not the shadcn Table wrapper): the wrapper's own
              overflow container would break position:sticky against this
              scroll area, and border-separate keeps the header's borders
              attached while the body scrolls underneath. */}
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              {sheet.rows.length > 0 ? (
                <thead>
                  <tr>
                    {sheet.rows[0].map((cell, cellIndex) => (
                      <th
                        key={cellIndex}
                        className="sticky top-0 z-10 border-r border-b bg-muted px-2.5 py-2 text-left text-xs font-semibold whitespace-nowrap last:border-r-0"
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {sheet.rows.slice(1).map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-muted/30">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border-r border-b px-2.5 py-1.5 whitespace-nowrap tabular-nums last:border-r-0"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sheet.truncated || preview.sheets.length > 1 ? (
            <p className="border-t bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
              {preview.sheets.length > 1 ? `Sheet: ${sheet.name}` : null}
              {preview.sheets.length > 1 && sheet.truncated ? " · " : null}
              {sheet.truncated
                ? "Preview truncated — open the file for the full data."
                : null}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function AttachmentPreview({ attachment }: { attachment: PreviewAttachment }) {
  const kind = classifyAttachment(attachment.fileName, attachment.mimeType);

  if (kind === "pdf") {
    return (
      <iframe
        src={attachment.href}
        title={attachment.fileName}
        className="h-[75vh] w-full rounded-lg border bg-muted/30"
      />
    );
  }

  if (kind === "csv" || kind === "xlsx" || kind === "xls") {
    return <SpreadsheetPreviewBlock attachment={attachment} />;
  }

  return <FallbackRow attachment={attachment} />;
}

/**
 * Renders every invoice-like attachment inline (PDF via the browser's native
 * viewer, spreadsheets as tables) so the source documents are readable
 * without leaving the page.
 */
export function InvoiceAttachmentPreviews({
  attachments,
}: {
  attachments: PreviewAttachment[];
}) {
  const previewable = attachments.filter((attachment) =>
    isInvoiceLikeAttachment(attachment.fileName, attachment.mimeType),
  );

  if (previewable.length === 0) return null;

  return (
    <div className="space-y-4">
      {previewable.map((attachment) => (
        <section key={attachment.key} className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="truncate text-sm font-medium">{attachment.fileName}</h4>
            <OpenInNewTabLink attachment={attachment} />
          </div>
          <AttachmentPreview attachment={attachment} />
        </section>
      ))}
    </div>
  );
}
