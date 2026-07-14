"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PaperclipIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { isInvoiceLikeAttachment } from "@/lib/attachment-types";

const ACCEPTED_FILE_TYPES = ".pdf,.csv,.xlsx,.xls,.docx";

type ReprocessAttachment = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  isPrimary: boolean;
};

type InvoiceReprocessDialogProps = {
  invoiceId: string;
  sourceType: "UPLOAD" | "EMAIL";
  attachments?: ReprocessAttachment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Controlled re-process confirmation dialog; the trigger lives in the invoice
 * Actions menu (DRAFT invoices only).
 */
export function InvoiceReprocessDialog({
  invoiceId,
  sourceType,
  attachments = [],
  open,
  onOpenChange,
}: InvoiceReprocessDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    attachments
      .filter((attachment) =>
        isInvoiceLikeAttachment(attachment.fileName, attachment.mimeType),
      )
      .map((attachment) => attachment.id),
  );
  const [file, setFile] = useState<File | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Match the source-attachments card: supported attachments are selected by
  // default, the rest stay hidden behind a "show all" toggle.
  const supportedAttachments = attachments.filter((attachment) =>
    isInvoiceLikeAttachment(attachment.fileName, attachment.mimeType),
  );
  const hiddenCount = attachments.length - supportedAttachments.length;
  const visibleAttachments =
    showAll || hiddenCount === 0 ? attachments : supportedAttachments;

  const sourceLabel =
    sourceType === "EMAIL"
      ? "the selected attachments and the body of the linked email"
      : "the selected files";

  const hasExtractionInput =
    selectedIds.length > 0 || file != null || sourceType === "EMAIL";

  // Restore defaults on close so the next open starts fresh (the initial
  // state above covers the very first open).
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      if (loading) return;
      setSelectedIds(
        attachments
          .filter((attachment) =>
            isInvoiceLikeAttachment(attachment.fileName, attachment.mimeType),
          )
          .map((attachment) => attachment.id),
      );
      setFile(null);
      setError(null);
      setShowAll(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    onOpenChange(nextOpen);
  }

  function toggleAttachment(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((entry) => entry !== id),
    );
  }

  async function reprocess() {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("attachmentIds", JSON.stringify(selectedIds));
    if (file) formData.set("file", file);

    const response = await fetch(`/api/invoices/${invoiceId}/reprocess`, {
      method: "POST",
      body: formData,
    });

    setLoading(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Failed to re-process the invoice");
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as {
      parseError?: string | null;
    };

    router.refresh();

    if (payload.parseError) {
      // The run completed but extraction failed; the previous values were
      // kept. Leave the dialog open so the user can adjust and retry.
      setError(`Extraction failed, previous values kept: ${payload.parseError}`);
      return;
    }

    handleOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && handleOpenChange(false)}
    >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-process this invoice?</DialogTitle>
            <DialogDescription>
              This re-runs data extraction on {sourceLabel}. The supplier,
              invoice number, dates, totals, and line items on this draft will
              all be replaced with the freshly extracted values — any manual
              edits or validation progress will be lost. The stored{" "}
              {sourceType === "EMAIL" ? "email and its attachments" : "files"}{" "}
              are not changed.
            </DialogDescription>
          </DialogHeader>

          {attachments.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Use these attachments</p>
              {visibleAttachments.length > 0 ? (
                visibleAttachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-start gap-3">
                    <Checkbox
                      id={`reprocess-attachment-${attachment.id}`}
                      checked={selectedIds.includes(attachment.id)}
                      onCheckedChange={(checked) =>
                        toggleAttachment(attachment.id, checked === true)
                      }
                    />
                    <Label
                      htmlFor={`reprocess-attachment-${attachment.id}`}
                      className="flex min-w-0 items-center gap-2 text-sm font-normal"
                    >
                      <span className="truncate">{attachment.fileName}</span>
                      {attachment.isPrimary ? <Badge>Primary</Badge> : null}
                    </Label>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No supported attachments to display.
                </p>
              )}
              {hiddenCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto w-fit px-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAll((current) => !current)}
                >
                  {showAll
                    ? "Show supported attachments only"
                    : `Show all attachments (${hiddenCount} hidden)`}
                </Button>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Deselected attachments stay on the invoice; they are just left
                out of the extraction.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Add a file (optional)</p>
            {file ? (
              <div className="flex items-center gap-2 text-sm">
                <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <XIcon />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => fileInputRef.current?.click()}
              >
                <PaperclipIcon />
                Choose file
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-sm text-muted-foreground">
              PDF, CSV, XLSX, XLS, or DOCX. The file is attached to the invoice
              and included in the extraction.
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void reprocess()}
              disabled={loading || !hasExtractionInput}
            >
              {loading ? "Re-processing..." : "Re-process invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
