"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type InvoiceTrashActionsProps = {
  invoiceId: string;
  deletedAt?: Date | string | null;
  vendorName?: string | null;
  variant?: "detail" | "row";
};

export function InvoiceTrashActions({
  invoiceId,
  deletedAt = null,
  vendorName,
  variant = "detail",
}: InvoiceTrashActionsProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDeleted = deletedAt != null;

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not move invoice to trash");
      }
      setDialogOpen(false);
      router.push("/trash");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move invoice to trash");
    } finally {
      setPending(false);
    }
  }

  async function handleRestore() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/restore`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not restore invoice");
      }
      router.push(`/invoices/${invoiceId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore invoice");
    } finally {
      setPending(false);
    }
  }

  if (isDeleted) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => void handleRestore()}>
          <Undo2Icon />
          Restore invoice
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <>
      <Button
        variant={variant === "row" ? "ghost" : "outline"}
        size="sm"
        disabled={pending}
        onClick={() => {
          setReason("");
          setError(null);
          setDialogOpen(true);
        }}
      >
        <Trash2Icon />
        Move to trash
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move invoice to trash?</DialogTitle>
            <DialogDescription>
              {vendorName
                ? `“${vendorName}” will be removed from the queue and kept in trash for 30 days.`
                : "This invoice will be removed from the queue and kept in trash for 30 days."}{" "}
              Email ingestion can create a new invoice from the same source after deletion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-reason">Reason (optional)</Label>
            <Textarea
              id="delete-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this invoice being removed?"
              rows={3}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => void handleDelete()}>
              Move to trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
