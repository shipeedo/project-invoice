"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { REBILL_UPLOAD_ACCEPT } from "@/lib/invoice-documents";

type InvoiceRebillSheetProps = {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Runs after the rebill is created (e.g. approve the invoice). Returning an
   * error message keeps the sheet open; resubmitting retries only this step.
   */
  onCreated?: () => Promise<string | null>;
  submitLabel?: string;
};

/**
 * Controlled sheet for creating a rebill; the trigger lives in the invoice
 * Actions menu.
 */
export function InvoiceRebillSheet({
  invoiceId,
  open,
  onOpenChange,
  onCreated,
  submitLabel = "Create rebill",
}: InvoiceRebillSheetProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customerName, setCustomerName] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [fileCount, setFileCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      if (submitting) return;
      setCustomerName("");
      setReference("");
      setNote("");
      setFileCount(0);
      setCreated(false);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function submitRebill() {
    if (!created) {
      const files = fileInputRef.current?.files;
      if (!customerName.trim()) {
        setError("Enter the customer to rebill.");
        return;
      }
      if (!files || files.length === 0) {
        setError("Attach at least one document for the sales invoice.");
        return;
      }

      setSubmitting(true);
      setError(null);

      const formData = new FormData();
      formData.append("customerName", customerName.trim());
      if (reference.trim()) formData.append("reference", reference.trim());
      if (note.trim()) formData.append("note", note.trim());
      for (const file of Array.from(files)) {
        formData.append("files", file);
      }

      const response = await fetch(`/api/invoices/${invoiceId}/rebill`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setSubmitting(false);
        setError(body?.error ?? "Failed to create rebill");
        return;
      }

      setCreated(true);
    } else {
      setSubmitting(true);
      setError(null);
    }

    if (onCreated) {
      const followUpError = await onCreated();
      if (followUpError) {
        setSubmitting(false);
        setError(followUpError);
        return;
      }
    }

    setSubmitting(false);
    handleOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>Rebill invoice</SheetTitle>
            <SheetDescription>
              The attached documents are used by the accounts team to create the
              sales invoice for this customer in the accounting system.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rebill-customer">Customer name</Label>
              <Input
                id="rebill-customer"
                required
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Acme Pty Ltd"
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="rebill-reference">Customer reference</Label>
              <Input
                id="rebill-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="PO or account reference (optional)"
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="rebill-files">Documents</Label>
              <Input
                id="rebill-files"
                ref={fileInputRef}
                type="file"
                multiple
                accept={REBILL_UPLOAD_ACCEPT}
                onChange={(event) => setFileCount(event.target.files?.length ?? 0)}
                disabled={submitting}
              />
              <p className="text-sm text-muted-foreground">
                Attach the charge breakdown or supporting paperwork the accounts
                team needs to raise the sales invoice.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="rebill-note">Note</Label>
              <Textarea
                id="rebill-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a note about this rebill (optional)"
                disabled={submitting}
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <Separator />

          <SheetFooter className="mt-auto flex-row justify-end gap-2 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitRebill()}
              disabled={submitting || !customerName.trim() || fileCount === 0}
            >
              {submitting ? "Working..." : submitLabel}
            </Button>
          </SheetFooter>
        </SheetContent>
    </Sheet>
  );
}
