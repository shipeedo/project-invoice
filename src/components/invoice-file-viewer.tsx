"use client";

import { DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SpreadsheetPreviewGrid } from "@/components/spreadsheet-preview-grid";
import type { SpreadsheetPreview } from "@/lib/attachment-preview";
import { classifyAttachment, extensionOf } from "@/lib/attachment-types";

export type ViewerFile = {
  fileName: string;
  mimeType: string | null;
  /** Streams the file inline; append ?download=1 for an attachment download. */
  streamUrl: string;
  /** JSON spreadsheet preview endpoint for CSV/XLSX/XLS files. */
  previewUrl: string;
};

type ViewerKind = "pdf" | "image" | "spreadsheet" | "other";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

function viewerKind(fileName: string, mimeType: string | null): ViewerKind {
  const kind = classifyAttachment(fileName, mimeType);
  if (kind === "pdf") return "pdf";
  if (kind === "csv" || kind === "xlsx" || kind === "xls") return "spreadsheet";
  if (
    IMAGE_EXTENSIONS.has(extensionOf(fileName)) ||
    (mimeType?.toLowerCase().startsWith("image/") ?? false)
  ) {
    return "image";
  }
  return "other";
}

function withDownloadParam(streamUrl: string) {
  return `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}download=1`;
}

type SpreadsheetFetchResult =
  | { url: string; status: "loaded"; preview: SpreadsheetPreview | null }
  | { url: string; status: "error" };

function SpreadsheetViewer({ file }: { file: ViewerFile }) {
  const [result, setResult] = useState<SpreadsheetFetchResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = file.previewUrl;

    fetch(url)
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setResult({ url, status: "error" });
          return;
        }
        const body = (await response.json()) as {
          preview: SpreadsheetPreview | null;
        };
        if (!cancelled) setResult({ url, status: "loaded", preview: body.preview });
      })
      .catch(() => {
        if (!cancelled) setResult({ url, status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [file.previewUrl]);

  // Loading is derived: a stale result (from a previously viewed file) is
  // treated the same as no result yet.
  const current = result?.url === file.previewUrl ? result : null;

  if (!current) {
    return <p className="text-sm text-muted-foreground">Loading preview...</p>;
  }
  if (current.status === "error") {
    return <p className="text-sm text-destructive">Could not load the preview.</p>;
  }
  if (!current.preview) {
    return (
      <p className="text-sm text-muted-foreground">
        No preview available. Download the file or open it in a new tab.
      </p>
    );
  }
  return (
    <SpreadsheetPreviewGrid
      // Remount per file so the active sheet tab resets.
      key={current.url}
      preview={current.preview}
      className="max-h-full"
      scrollAreaClassName="max-h-none"
    />
  );
}

function ViewerBody({ file }: { file: ViewerFile }) {
  const kind = viewerKind(file.fileName, file.mimeType);

  if (kind === "pdf") {
    return (
      <iframe
        src={file.streamUrl}
        title={file.fileName}
        className="h-[70vh] max-h-full w-full rounded-lg border bg-muted/30"
      />
    );
  }

  if (kind === "image") {
    return (
      <div className="flex max-h-[70vh] items-center justify-center overflow-auto rounded-lg border bg-muted/30 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- local upload stream, dimensions unknown */}
        <img
          src={file.streamUrl}
          alt={file.fileName}
          className="max-h-[66vh] max-w-full object-contain"
        />
      </div>
    );
  }

  if (kind === "spreadsheet") {
    return <SpreadsheetViewer file={file} />;
  }

  return (
    <p className="text-sm text-muted-foreground">
      No preview available for this file type. Download the file or open it in a
      new tab.
    </p>
  );
}

type InvoiceFileViewerDialogProps = {
  file: ViewerFile | null;
  onClose: () => void;
};

/**
 * Large dialog that previews an invoice file (original attachment or uploaded
 * document) in place: PDFs in an iframe, images inline, spreadsheets as a
 * table fetched from the preview endpoint, and a download fallback otherwise.
 */
export function InvoiceFileViewerDialog({
  file,
  onClose,
}: InvoiceFileViewerDialogProps) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      {/* Three explicit rows (header / body / footer) with a viewport height
          cap: the body row gets minmax(0,1fr) so wide or tall previews scroll
          inside it instead of growing the dialog past the screen. */}
      <DialogContent className="max-h-[calc(100dvh-3rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-5xl">
        {file ? (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-8">{file.fileName}</DialogTitle>
            </DialogHeader>

            <div className="min-h-0 min-w-0 overflow-hidden">
              <ViewerBody file={file} />
            </div>

            <DialogFooter>
              <a
                href={file.streamUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 self-center text-sm text-muted-foreground transition-colors hover:text-foreground sm:mr-auto"
              >
                Open in new tab
                <ExternalLinkIcon className="size-3.5" />
              </a>
              <Button
                type="button"
                variant="outline"
                render={
                  <a
                    href={withDownloadParam(file.streamUrl)}
                    download={file.fileName}
                  />
                }
              >
                <DownloadIcon />
                Download
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
