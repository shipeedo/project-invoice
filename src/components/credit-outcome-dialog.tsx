"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDecimalAmount, parseDecimalAmount } from "@/lib/format";
import {
  CREDIT_NOTE_UPLOAD_ACCEPT,
  CREDIT_NOTE_UPLOAD_EXTENSIONS,
  hasAllowedExtension,
} from "@/lib/invoice-documents";

type CreditOutcomeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditRequestId: string;
  defaultApprovedAmount?: number | null;
};

export function CreditOutcomeDialog({
  open,
  onOpenChange,
  creditRequestId,
  defaultApprovedAmount,
}: CreditOutcomeDialogProps) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<"approved" | "denied">("approved");
  const [approvedAmountOverride, setApprovedAmountOverride] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const defaultApprovedAmountValue = useMemo(() => {
    if (!open || defaultApprovedAmount == null || defaultApprovedAmount <= 0) return "";
    return formatDecimalAmount(defaultApprovedAmount);
  }, [open, defaultApprovedAmount]);

  const approvedAmount = approvedAmountOverride ?? defaultApprovedAmountValue;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setOutcome("approved");
      setApprovedAmountOverride(null);
      setFiles([]);
      setNote("");
      setFileInputKey((key) => key + 1);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit() {
    setError(null);

    const invalidFile = files.find(
      (file) => !hasAllowedExtension(file.name, CREDIT_NOTE_UPLOAD_EXTENSIONS),
    );
    if (invalidFile) {
      setError("Supported credit note uploads: PDF, CSV, XLSX, and XLS");
      return;
    }

    const formData = new FormData();
    formData.set("action", "record_outcome");
    formData.set("outcome", outcome);

    if (outcome === "approved") {
      const amount = parseDecimalAmount(approvedAmount);
      if (amount == null || amount <= 0) {
        setError("Approved amount is required");
        return;
      }
      formData.set("approvedAmount", String(amount));
    }

    for (const file of files) {
      formData.append("files", file);
    }
    if (note.trim()) {
      formData.set("note", note.trim());
    }

    setLoading(true);

    const response = await fetch(`/api/credit-requests/${creditRequestId}`, {
      method: "PATCH",
      body: formData,
    });

    setLoading(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to record outcome");
      return;
    }

    handleOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record credit outcome</DialogTitle>
          <DialogDescription>
            Record whether the carrier approved or denied this credit request.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={outcome === "approved" ? "default" : "outline"}
            onClick={() => setOutcome("approved")}
          >
            Approved
          </Button>
          <Button
            type="button"
            variant={outcome === "denied" ? "destructive" : "outline"}
            onClick={() => setOutcome("denied")}
          >
            Denied
          </Button>
        </div>

        {outcome === "approved" ? (
          <div className="space-y-2">
            <Label htmlFor="approved-amount">Approved amount</Label>
            <Input
              id="approved-amount"
              inputMode="decimal"
              value={approvedAmount}
              onChange={(event) => setApprovedAmountOverride(event.target.value)}
              onBlur={() => {
                const parsed = parseDecimalAmount(approvedAmount);
                if (parsed != null) {
                  setApprovedAmountOverride(formatDecimalAmount(parsed));
                }
              }}
              placeholder="0.00"
              required
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="credit-note-files">
            Credit note file(s){" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            key={fileInputKey}
            id="credit-note-files"
            type="file"
            multiple
            accept={CREDIT_NOTE_UPLOAD_ACCEPT}
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          <p className="text-xs text-muted-foreground">
            Attach the credit note received from the carrier (PDF, CSV, XLSX, or
            XLS). Files are added to the invoice documents.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="credit-outcome-note">
            Note{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="credit-outcome-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note added to the invoice"
            rows={3}
          />
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
          <Button type="button" onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? "Saving..." : "Save outcome"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
