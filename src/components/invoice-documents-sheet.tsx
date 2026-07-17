"use client";

import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import {
  InvoiceFileViewerDialog,
  type ViewerFile,
} from "@/components/invoice-file-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { isInvoiceLikeAttachment } from "@/lib/attachment-types";
import { documentKindLabel, formatFileSize } from "@/lib/invoice-documents";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type InvoiceDocumentLink = {
  key: string;
  fileName: string;
  mimeType: string | null;
  size: number | null;
  /** "ORIGINAL" for source files (email attachments / upload), else the document kind. */
  kind: "ORIGINAL" | "GENERAL" | "REBILL" | "CREDIT";
  addedAt: string;
  streamUrl: string;
  previewUrl: string;
};

/**
 * Originals that don't look like invoices (email logos, signatures, ...) sit
 * behind a "show more" toggle, mirroring the detail page's Documents card.
 * The queue's count button uses this too so the number matches the sheet.
 */
export function isDefaultVisibleDocument(document: InvoiceDocumentLink) {
  return (
    document.kind !== "ORIGINAL" ||
    isInvoiceLikeAttachment(document.fileName, document.mimeType)
  );
}

function withDownloadParam(streamUrl: string) {
  return `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}download=1`;
}

function KindBadge({ kind }: { kind: InvoiceDocumentLink["kind"] }) {
  if (kind === "ORIGINAL") {
    return <Badge variant="secondary">Original</Badge>;
  }
  return (
    <Badge
      variant={kind === "GENERAL" ? "secondary" : "outline"}
      className={cn(
        kind === "CREDIT" &&
          "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      {documentKindLabel(kind)}
    </Badge>
  );
}

type InvoiceDocumentsSheetProps = {
  supplierName: string;
  documents: InvoiceDocumentLink[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Right-hand sheet listing every file on an invoice (originals and uploaded
 * documents) with in-place preview and download, opened from the queue's
 * Docs column.
 */
export function InvoiceDocumentsSheet({
  supplierName,
  documents,
  open,
  onOpenChange,
}: InvoiceDocumentsSheetProps) {
  const [viewerFile, setViewerFile] = useState<ViewerFile | null>(null);
  const [showAll, setShowAll] = useState(false);

  const defaultVisible = documents.filter(isDefaultVisibleDocument);
  const hiddenCount = documents.length - defaultVisible.length;
  const visibleDocuments =
    showAll || hiddenCount === 0 ? documents : defaultVisible;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>Documents</SheetTitle>
            <SheetDescription>
              Files on the {supplierName} invoice. Select a file to view it, or
              download it directly.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {documents.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No documents yet</EmptyTitle>
                  <EmptyDescription>
                    This invoice has no original file or supporting documents.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="space-y-3 text-sm">
                {visibleDocuments.map((document) => (
                  <li
                    key={document.key}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-3 last:border-0"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setViewerFile({
                          fileName: document.fileName,
                          mimeType: document.mimeType,
                          streamUrl: document.streamUrl,
                          previewUrl: document.previewUrl,
                        })
                      }
                      className="max-w-full truncate text-left font-medium text-primary hover:underline"
                    >
                      {document.fileName}
                    </button>
                    <KindBadge kind={document.kind} />
                    <span className="text-muted-foreground">
                      {formatDate(document.addedAt)}
                      {document.size != null
                        ? ` · ${formatFileSize(document.size)}`
                        : null}
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="ml-auto"
                      aria-label={`Download ${document.fileName}`}
                      nativeButton={false}
                      render={
                        <a
                          href={withDownloadParam(document.streamUrl)}
                          download={document.fileName}
                        />
                      }
                    >
                      <DownloadIcon />
                    </Button>
                  </li>
                ))}
                {hiddenCount > 0 ? (
                  <li>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowAll((current) => !current)}
                    >
                      {showAll ? "Show fewer" : `Show ${hiddenCount} more`}
                    </Button>
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <InvoiceFileViewerDialog
        file={viewerFile}
        onClose={() => setViewerFile(null)}
      />
    </>
  );
}
