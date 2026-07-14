"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  InvoiceFileViewerDialog,
  type ViewerFile,
} from "@/components/invoice-file-viewer";
import { formatDate } from "@/lib/format";
import { isInvoiceLikeAttachment } from "@/lib/attachment-types";
import {
  DOCUMENT_UPLOAD_ACCEPT,
  documentKindLabel,
  formatFileSize,
} from "@/lib/invoice-documents";
import { cn } from "@/lib/utils";

export type InvoiceDocumentItem = {
  id: string;
  fileName: string;
  mimeType: string | null;
  kind: "GENERAL" | "REBILL" | "CREDIT";
  size: number | null;
  createdAt: string;
  uploaderName: string | null;
  rebillCustomerName: string | null;
  creditRequestSubject: string | null;
};

export type InvoiceOriginalFileItem = {
  key: string;
  fileName: string;
  mimeType: string | null;
  size: number | null;
  receivedAt: string;
  isPrimary: boolean;
  streamUrl: string;
  previewUrl: string;
};

type InvoiceDocumentsCardProps = {
  invoiceId: string;
  originals: InvoiceOriginalFileItem[];
  documents: InvoiceDocumentItem[];
  canModify: boolean;
};

const UPLOAD_KIND_OPTIONS = [
  { value: "GENERAL", label: "Document" },
  { value: "CREDIT", label: "Credit note" },
] as const;

function KindBadge({ document }: { document: InvoiceDocumentItem }) {
  return (
    <Badge
      variant={document.kind === "GENERAL" ? "secondary" : "outline"}
      className={cn(
        document.kind === "CREDIT" &&
          "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      {documentKindLabel(document.kind)}
      {document.kind === "REBILL" && document.rebillCustomerName
        ? ` · ${document.rebillCustomerName}`
        : null}
      {document.kind === "CREDIT" && document.creditRequestSubject
        ? ` · ${document.creditRequestSubject}`
        : null}
    </Badge>
  );
}

export function InvoiceDocumentsCard({
  invoiceId,
  originals,
  documents,
  canModify,
}: InvoiceDocumentsCardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [kind, setKind] = useState<"GENERAL" | "CREDIT">("GENERAL");
  const [note, setNote] = useState("");
  const [fileCount, setFileCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceDocumentItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<ViewerFile | null>(null);
  const [showAllOriginals, setShowAllOriginals] = useState(false);

  // Mirror the old source-attachments card: invoice-like originals show by
  // default, the rest (email logos, signatures, ...) sit behind a toggle.
  const supportedOriginals = originals.filter((original) =>
    isInvoiceLikeAttachment(original.fileName, original.mimeType),
  );
  const hiddenOriginalCount = originals.length - supportedOriginals.length;
  const visibleOriginals =
    showAllOriginals || hiddenOriginalCount === 0 ? originals : supportedOriginals;

  function closeAddDialog() {
    if (uploading) return;
    setAddOpen(false);
    setKind("GENERAL");
    setNote("");
    setFileCount(0);
    setUploadError(null);
  }

  async function uploadDocuments() {
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) {
      setUploadError("Choose at least one file to upload.");
      return;
    }

    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append("files", file);
    }
    formData.append("kind", kind);
    if (note.trim()) formData.append("note", note.trim());

    const response = await fetch(`/api/invoices/${invoiceId}/documents`, {
      method: "POST",
      body: formData,
    });

    setUploading(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setUploadError(body?.error ?? "Failed to upload documents");
      return;
    }

    setAddOpen(false);
    setKind("GENERAL");
    setNote("");
    setFileCount(0);
    router.refresh();
  }

  async function deleteDocument() {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);

    const response = await fetch(
      `/api/invoices/${invoiceId}/documents/${deleteTarget.id}`,
      { method: "DELETE" },
    );

    setDeleting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setDeleteError(body?.error ?? "Failed to remove document");
      return;
    }

    setDeleteTarget(null);
    router.refresh();
  }

  function openOriginal(original: InvoiceOriginalFileItem) {
    setViewerFile({
      fileName: original.fileName,
      mimeType: original.mimeType,
      streamUrl: original.streamUrl,
      previewUrl: original.previewUrl,
    });
  }

  function openDocument(document: InvoiceDocumentItem) {
    setViewerFile({
      fileName: document.fileName,
      mimeType: document.mimeType,
      streamUrl: `/api/invoices/${invoiceId}/documents/${document.id}`,
      previewUrl: `/api/invoices/${invoiceId}/preview?documentId=${document.id}`,
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle>Documents</CardTitle>
        {canModify ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAddOpen(true)}
          >
            <PlusIcon />
            Add documents
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {originals.length === 0 && documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No documents yet. Attach credit notes, rebill paperwork, or any other
            supporting files.
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {visibleOriginals.map((original) => (
              <li
                key={original.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-3 last:border-0"
              >
                <button
                  type="button"
                  onClick={() => openOriginal(original)}
                  className="max-w-full truncate text-left font-medium text-primary hover:underline"
                >
                  {original.fileName}
                </button>
                <Badge variant="secondary">Original</Badge>
                <span className="text-muted-foreground">
                  Received {formatDate(original.receivedAt)}
                  {original.size != null
                    ? ` · ${formatFileSize(original.size)}`
                    : null}
                </span>
              </li>
            ))}
            {hiddenOriginalCount > 0 ? (
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAllOriginals((current) => !current)}
                >
                  {showAllOriginals
                    ? "Show fewer"
                    : `Show ${hiddenOriginalCount} more`}
                </Button>
              </li>
            ) : null}
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-3 last:border-0"
              >
                <button
                  type="button"
                  onClick={() => openDocument(document)}
                  className="max-w-full truncate text-left font-medium text-primary hover:underline"
                >
                  {document.fileName}
                </button>
                <KindBadge document={document} />
                <span className="text-muted-foreground">
                  {document.uploaderName ?? "System"}
                  {" · "}
                  {formatDate(document.createdAt)}
                  {" · "}
                  {formatFileSize(document.size)}
                </span>
                {canModify && document.kind === "GENERAL" ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="ml-auto"
                    aria-label={`Remove ${document.fileName}`}
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(document);
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <InvoiceFileViewerDialog
        file={viewerFile}
        onClose={() => setViewerFile(null)}
      />

      <Dialog open={addOpen} onOpenChange={(open) => !open && closeAddDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add documents</DialogTitle>
            <DialogDescription>
              Attach supporting files to this invoice. Use “Credit note” for credit
              documents received from the supplier.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="document-files">Files</Label>
              <Input
                id="document-files"
                ref={fileInputRef}
                type="file"
                multiple
                accept={DOCUMENT_UPLOAD_ACCEPT}
                onChange={(event) => setFileCount(event.target.files?.length ?? 0)}
                disabled={uploading}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="document-kind">Type</Label>
              <Select
                items={UPLOAD_KIND_OPTIONS.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                value={kind}
                onValueChange={(value) => {
                  if (value === "GENERAL" || value === "CREDIT") setKind(value);
                }}
              >
                <SelectTrigger id="document-kind" className="w-full">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {UPLOAD_KIND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="document-note">Note</Label>
              <Textarea
                id="document-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a note about these documents (optional)"
                disabled={uploading}
              />
            </div>

            {uploadError ? (
              <p className="text-sm text-destructive">{uploadError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeAddDialog}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void uploadDocuments()}
              disabled={uploading || fileCount === 0}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove document?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `“${deleteTarget.fileName}” will no longer appear on this invoice.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteDocument()}
              disabled={deleting}
            >
              {deleting ? "Removing..." : "Remove document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
