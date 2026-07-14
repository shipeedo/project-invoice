"use client";

import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  PauseIcon,
  PlayIcon,
  ReceiptIcon,
  RefreshCwIcon,
  Repeat2Icon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CreditRequestSheet } from "@/components/credit-request-sheet";
import { InvoiceRebillSheet } from "@/components/invoice-rebill-sheet";
import { InvoiceReprocessDialog } from "@/components/invoice-reprocess-dialog";
import {
  APPROVABLE_STATUSES,
  HOLDABLE_STATUSES,
  REJECTABLE_STATUSES,
  canCancelInvoice,
} from "@/lib/invoice-status";
import type { InvoiceStatus, UserRole } from "@/lib/db/types";

type ReprocessAttachment = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  isPrimary: boolean;
};

type InvoiceActionsMenuProps = {
  invoiceId: string;
  status: InvoiceStatus;
  validatedAt?: Date | string | null;
  assignedToId?: string | null;
  currentUserId: string;
  currentUserRole: UserRole;
  inTrash: boolean;
  vendorName?: string | null;
  sourceType: "UPLOAD" | "EMAIL";
  currency: string;
  reprocessAttachments?: ReprocessAttachment[];
};

type ConfirmAction = "approve" | "reject";
type ReasonAction = "hold" | "cancel";
type LifecycleAction = ConfirmAction | ReasonAction | "resume";
type ActionDialog =
  | ConfirmAction
  | ReasonAction
  | "trash"
  | "rebill"
  | "approve-rebill"
  | "approve-credit"
  | "reprocess";
type PendingAction = LifecycleAction | "trash" | "restore";

const CONFIRM_COPY: Record<
  ConfirmAction,
  { title: string; description: string; checkbox: string; confirm: string }
> = {
  approve: {
    title: "Approve invoice for payment?",
    description:
      "Approving will mark every line item as approved for payment. Please review the invoice charges before continuing.",
    checkbox:
      "I have checked the invoice charges and confirm they look correct and can be paid.",
    confirm: "Approve invoice",
  },
  reject: {
    title: "Reject invoice?",
    description:
      "Rejecting will mark every line item as rejected and block payment. Please review the invoice charges before continuing.",
    checkbox:
      "I have checked the invoice charges and confirm they should not be paid.",
    confirm: "Reject invoice",
  },
};

const REASON_COPY: Record<
  ReasonAction,
  { title: string; description: string; placeholder: string; confirm: string }
> = {
  hold: {
    title: "Place invoice on hold?",
    description:
      "The invoice will be paused until the hold is released. Its current status will be restored when work resumes.",
    placeholder: "Reason for the hold (optional)",
    confirm: "Place on hold",
  },
  cancel: {
    title: "Cancel invoice?",
    description:
      "Cancelling permanently closes the invoice. No further approvals or payments can be recorded against it.",
    placeholder: "Reason for cancelling (optional)",
    confirm: "Cancel invoice",
  },
};

/**
 * Single "Actions" dropdown for the invoice header. Menu items open the same
 * confirm dialogs/sheets that used to sit behind individual header buttons;
 * items that don't apply to the current status/role are hidden entirely.
 */
export function InvoiceActionsMenu({
  invoiceId,
  status,
  validatedAt,
  assignedToId,
  currentUserId,
  currentUserRole,
  inTrash,
  vendorName,
  sourceType,
  currency,
  reprocessAttachments = [],
}: InvoiceActionsMenuProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [loading, setLoading] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");

  const canManageHold =
    currentUserRole === "ADMIN" ||
    (assignedToId != null && assignedToId === currentUserId);

  const canApprove =
    !inTrash && APPROVABLE_STATUSES.includes(status) && Boolean(validatedAt);
  const canReject = !inTrash && REJECTABLE_STATUSES.includes(status);
  const canHold = !inTrash && HOLDABLE_STATUSES.includes(status) && canManageHold;
  const canResume = !inTrash && status === "ON_HOLD" && canManageHold;
  const canCancel = !inTrash && canCancelInvoice(status);
  const canRebill = !inTrash && status !== "CANCELLED";
  const canReprocess = !inTrash && status === "DRAFT";
  const canTrash = !inTrash;
  const canRestore = inTrash;

  const hasLifecycleGroup = canApprove || canResume || canHold;
  const hasDocumentsGroup = canRebill || canReprocess;
  const hasDangerGroup = canReject || canCancel || canTrash;
  const hasAnyAction =
    hasLifecycleGroup || hasDocumentsGroup || hasDangerGroup || canRestore;

  if (!hasAnyAction) {
    return null;
  }

  // Open the dialog on the next tick so the menu's close/focus-return doesn't
  // fight the dialog's focus trap.
  function openDialog(next: ActionDialog) {
    setConfirmed(false);
    setReason("");
    setError(null);
    setTimeout(() => setDialog(next), 0);
  }

  function closeDialog() {
    if (loading) return;
    setDialog(null);
  }

  async function submitLifecycle(
    action: LifecycleAction,
    payload: unknown,
  ) {
    setLoading(action);
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(null);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "Action failed");
      return;
    }

    setDialog(null);
    router.refresh();
  }

  async function submitTrash() {
    setLoading("trash");
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || undefined }),
    });

    setLoading(null);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "Could not move invoice to trash");
      return;
    }

    setDialog(null);
    router.push("/trash");
    router.refresh();
  }

  // Passed to the rebill/credit sheets so approval runs after the panel's
  // submission succeeds; the returned message keeps the sheet open on failure.
  function approveAfter(createdThing: "rebill" | "credit request") {
    return async (): Promise<string | null> => {
      const response = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        return null;
      }

      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      return `The ${createdThing} was created, but the invoice could not be approved${
        body?.error ? `: ${body.error}` : ""
      }. Submit again to retry the approval, or approve from the Actions menu.`;
    };
  }

  async function submitRestore() {
    setLoading("restore");
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/restore`, {
      method: "POST",
    });

    setLoading(null);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "Could not restore invoice");
      return;
    }

    router.refresh();
  }

  const confirmCopy =
    dialog === "approve" || dialog === "reject" ? CONFIRM_COPY[dialog] : null;
  const reasonCopy =
    dialog === "hold" || dialog === "cancel" ? REASON_COPY[dialog] : null;

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading !== null}
              />
            }
          >
            Actions
            <ChevronDownIcon className="text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {canRestore ? (
              <DropdownMenuItem onClick={() => void submitRestore()}>
                <Undo2Icon />
                Restore invoice
              </DropdownMenuItem>
            ) : (
              <>
                {canApprove ? (
                  <DropdownMenuItem
                    className="font-medium"
                    onClick={() => openDialog("approve")}
                  >
                    <CheckIcon />
                    Approve invoice
                  </DropdownMenuItem>
                ) : null}
                {canApprove ? (
                  <DropdownMenuItem onClick={() => openDialog("approve-rebill")}>
                    <Repeat2Icon />
                    Approve &amp; rebill…
                  </DropdownMenuItem>
                ) : null}
                {canApprove ? (
                  <DropdownMenuItem onClick={() => openDialog("approve-credit")}>
                    <ReceiptIcon />
                    Approve with credit…
                  </DropdownMenuItem>
                ) : null}
                {canResume ? (
                  <DropdownMenuItem
                    onClick={() => void submitLifecycle("resume", {})}
                  >
                    <PlayIcon />
                    Release hold
                  </DropdownMenuItem>
                ) : null}
                {canHold ? (
                  <DropdownMenuItem onClick={() => openDialog("hold")}>
                    <PauseIcon />
                    Place on hold
                  </DropdownMenuItem>
                ) : null}

                {hasLifecycleGroup && hasDocumentsGroup ? (
                  <DropdownMenuSeparator />
                ) : null}

                {canRebill ? (
                  <DropdownMenuItem onClick={() => openDialog("rebill")}>
                    <Repeat2Icon />
                    Rebill…
                  </DropdownMenuItem>
                ) : null}
                {canReprocess ? (
                  <DropdownMenuItem onClick={() => openDialog("reprocess")}>
                    <RefreshCwIcon />
                    Re-process…
                  </DropdownMenuItem>
                ) : null}

                {(hasLifecycleGroup || hasDocumentsGroup) && hasDangerGroup ? (
                  <DropdownMenuSeparator />
                ) : null}

                {canReject ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => openDialog("reject")}
                  >
                    <XIcon />
                    Reject invoice
                  </DropdownMenuItem>
                ) : null}
                {canCancel ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => openDialog("cancel")}
                  >
                    <BanIcon />
                    Cancel invoice
                  </DropdownMenuItem>
                ) : null}
                {canTrash ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => openDialog("trash")}
                  >
                    <Trash2Icon />
                    Move to trash
                  </DropdownMenuItem>
                ) : null}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {error && dialog === null ? (
          <p className="max-w-xs text-right text-xs text-destructive">{error}</p>
        ) : null}
      </div>

      <Dialog
        open={confirmCopy !== null || reasonCopy !== null || dialog === "trash"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          {confirmCopy && (dialog === "approve" || dialog === "reject") ? (
            <>
              <DialogHeader>
                <DialogTitle>{confirmCopy.title}</DialogTitle>
                <DialogDescription>{confirmCopy.description}</DialogDescription>
              </DialogHeader>

              <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
                <Checkbox
                  id="invoice-confirm-checked"
                  checked={confirmed}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                />
                <Label
                  htmlFor="invoice-confirm-checked"
                  className="text-sm leading-snug font-normal"
                >
                  {confirmCopy.checkbox}
                </Label>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDialog}
                  disabled={loading !== null}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant={dialog === "reject" ? "destructive" : "default"}
                  onClick={() => void submitLifecycle(dialog, {})}
                  disabled={!confirmed || loading !== null}
                >
                  {loading === dialog ? "Working..." : confirmCopy.confirm}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {reasonCopy && (dialog === "hold" || dialog === "cancel") ? (
            <>
              <DialogHeader>
                <DialogTitle>{reasonCopy.title}</DialogTitle>
                <DialogDescription>{reasonCopy.description}</DialogDescription>
              </DialogHeader>

              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={reasonCopy.placeholder}
              />

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDialog}
                  disabled={loading !== null}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant={dialog === "cancel" ? "destructive" : "default"}
                  onClick={() =>
                    void submitLifecycle(dialog, {
                      reason: reason.trim() || undefined,
                    })
                  }
                  disabled={loading !== null}
                >
                  {loading === dialog ? "Working..." : reasonCopy.confirm}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {dialog === "trash" ? (
            <>
              <DialogHeader>
                <DialogTitle>Move invoice to trash?</DialogTitle>
                <DialogDescription>
                  {vendorName
                    ? `“${vendorName}” will be removed from the queue and kept in trash for 30 days.`
                    : "This invoice will be removed from the queue and kept in trash for 30 days."}{" "}
                  Email ingestion can create a new invoice from the same source
                  after deletion.
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDialog}
                  disabled={loading !== null}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void submitTrash()}
                  disabled={loading !== null}
                >
                  {loading === "trash" ? "Moving..." : "Move to trash"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <InvoiceRebillSheet
        invoiceId={invoiceId}
        open={dialog === "rebill" || dialog === "approve-rebill"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onCreated={dialog === "approve-rebill" ? approveAfter("rebill") : undefined}
        submitLabel={
          dialog === "approve-rebill" ? "Create rebill & approve" : undefined
        }
      />

      <CreditRequestSheet
        invoiceId={invoiceId}
        currency={currency}
        open={dialog === "approve-credit"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onCreated={approveAfter("credit request")}
        submitLabel="Create credit & approve"
      />

      <InvoiceReprocessDialog
        invoiceId={invoiceId}
        sourceType={sourceType}
        attachments={reprocessAttachments}
        open={dialog === "reprocess"}
        onOpenChange={(open) => setDialog(open ? "reprocess" : null)}
      />
    </>
  );
}
