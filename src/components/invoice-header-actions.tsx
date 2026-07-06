"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BanIcon,
  BanknoteIcon,
  CheckIcon,
  PauseIcon,
  PlayIcon,
  XIcon,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  APPROVABLE_STATUSES,
  HOLDABLE_STATUSES,
  PAYABLE_STATUSES,
  REJECTABLE_STATUSES,
  canCancelInvoice,
  outstandingAmount,
} from "@/lib/invoice-status";
import type { InvoiceStatus, UserRole } from "@/lib/db/types";
import { formatCurrency } from "@/lib/format";

type InvoiceHeaderActionsProps = {
  invoiceId: string;
  status: InvoiceStatus;
  validatedAt?: Date | string | null;
  assignedToId?: string | null;
  currentUserId: string;
  currentUserRole: UserRole;
  totalAmount?: number | null;
  amountPaid: number;
  currency: string;
};

type ConfirmAction = "approve" | "reject";
type ReasonAction = "hold" | "cancel";
type PendingAction = ConfirmAction | ReasonAction | "resume" | "payment";

const CONFIRM_COPY: Record<
  ConfirmAction,
  { title: string; description: string; checkbox: string; confirm: string }
> = {
  approve: {
    title: "Approve invoice for payment?",
    description:
      "Approving will mark every line item as approved for payment. Please review the invoice charges before continuing.",
    checkbox: "I have checked the invoice charges and confirm they look correct and can be paid.",
    confirm: "Approve invoice",
  },
  reject: {
    title: "Reject invoice?",
    description:
      "Rejecting will mark every line item as rejected and block payment. Please review the invoice charges before continuing.",
    checkbox: "I have checked the invoice charges and confirm they should not be paid.",
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

export function InvoiceHeaderActions({
  invoiceId,
  status,
  validatedAt,
  assignedToId,
  currentUserId,
  currentUserRole,
  totalAmount,
  amountPaid,
  currency,
}: InvoiceHeaderActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<PendingAction | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [settlesInFull, setSettlesInFull] = useState(false);

  const canManageHold =
    currentUserRole === "ADMIN" || (assignedToId != null && assignedToId === currentUserId);

  const canApprove = APPROVABLE_STATUSES.includes(status) && Boolean(validatedAt);
  const canReject = REJECTABLE_STATUSES.includes(status);
  const canHold = HOLDABLE_STATUSES.includes(status) && canManageHold;
  const canResume = status === "ON_HOLD" && canManageHold;
  const canRecordPayment = PAYABLE_STATUSES.includes(status);
  const canCancel = canCancelInvoice(status);

  if (!canApprove && !canReject && !canHold && !canResume && !canRecordPayment && !canCancel) {
    return null;
  }

  const outstanding = outstandingAmount(totalAmount, amountPaid);

  function openDialog(action: Exclude<PendingAction, "resume">) {
    setPendingAction(action);
    setConfirmed(false);
    setReason("");
    setPaymentAmount("");
    setPaymentDate("");
    setPaymentRef("");
    setPaymentNote("");
    setSettlesInFull(false);
    setError(null);
  }

  function closeDialog() {
    if (loading) return;
    setPendingAction(null);
  }

  async function submit(action: PendingAction, path: string, payload: unknown) {
    setLoading(action);
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Action failed");
      return;
    }

    setPendingAction(null);
    router.refresh();
  }

  function submitPayment() {
    const trimmed = paymentAmount.trim();
    const amount = trimmed ? Number(trimmed) : undefined;

    if (trimmed && (!Number.isFinite(amount) || (amount as number) <= 0)) {
      setError("Enter a payment amount greater than zero");
      return;
    }
    if (!trimmed && !settlesInFull) {
      setError("Enter a payment amount or mark the invoice as fully paid");
      return;
    }

    void submit("payment", "payments", {
      amount,
      paidAt: paymentDate || undefined,
      transactionRef: paymentRef.trim() || undefined,
      note: paymentNote.trim() || undefined,
      markAsPaid: settlesInFull,
    });
  }

  const confirmCopy =
    pendingAction === "approve" || pendingAction === "reject"
      ? CONFIRM_COPY[pendingAction]
      : null;
  const reasonCopy =
    pendingAction === "hold" || pendingAction === "cancel"
      ? REASON_COPY[pendingAction]
      : null;

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          {canApprove ? (
            <Button type="button" size="sm" onClick={() => openDialog("approve")} disabled={loading !== null}>
              <CheckIcon />
              Approve invoice
            </Button>
          ) : null}
          {canRecordPayment ? (
            <Button type="button" size="sm" onClick={() => openDialog("payment")} disabled={loading !== null}>
              <BanknoteIcon />
              Record payment
            </Button>
          ) : null}
          {canResume ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void submit("resume", "resume", {})}
              disabled={loading !== null}
            >
              <PlayIcon />
              {loading === "resume" ? "Releasing..." : "Release hold"}
            </Button>
          ) : null}
          {canHold ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => openDialog("hold")}
              disabled={loading !== null}
            >
              <PauseIcon />
              Place on hold
            </Button>
          ) : null}
          {canReject ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => openDialog("reject")}
              disabled={loading !== null}
            >
              <XIcon />
              Reject invoice
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openDialog("cancel")}
              disabled={loading !== null}
            >
              <BanIcon />
              Cancel invoice
            </Button>
          ) : null}
        </div>
        {error && !pendingAction ? (
          <p className="max-w-xs text-right text-xs text-destructive">{error}</p>
        ) : null}
      </div>

      <Dialog open={pendingAction !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          {confirmCopy && pendingAction ? (
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
                <Label htmlFor="invoice-confirm-checked" className="text-sm leading-snug font-normal">
                  {confirmCopy.checkbox}
                </Label>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog} disabled={loading !== null}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant={pendingAction === "reject" ? "destructive" : "default"}
                  onClick={() => void submit(pendingAction, pendingAction as string, {})}
                  disabled={!confirmed || loading !== null}
                >
                  {loading === pendingAction ? "Working..." : confirmCopy.confirm}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {reasonCopy && pendingAction ? (
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
                <Button type="button" variant="outline" onClick={closeDialog} disabled={loading !== null}>
                  Back
                </Button>
                <Button
                  type="button"
                  variant={pendingAction === "cancel" ? "destructive" : "default"}
                  onClick={() =>
                    void submit(pendingAction, pendingAction as string, {
                      reason: reason.trim() || undefined,
                    })
                  }
                  disabled={loading !== null}
                >
                  {loading === pendingAction ? "Working..." : reasonCopy.confirm}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {pendingAction === "payment" ? (
            <>
              <DialogHeader>
                <DialogTitle>Record a payment</DialogTitle>
                <DialogDescription>
                  {outstanding != null
                    ? `Outstanding balance: ${formatCurrency(outstanding, currency)}.`
                    : "The invoice total is unknown, so payments will not settle it automatically."}{" "}
                  Optionally link the transaction in your accounting software.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="payment-amount">Amount</Label>
                    <Input
                      id="payment-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      placeholder={
                        outstanding != null && settlesInFull ? String(outstanding) : "0.00"
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="payment-date">Paid on</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={(event) => setPaymentDate(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payment-ref">Accounting transaction link or reference</Label>
                  <Input
                    id="payment-ref"
                    value={paymentRef}
                    onChange={(event) => setPaymentRef(event.target.value)}
                    placeholder="https://… or reference (optional)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payment-note">Note</Label>
                  <Textarea
                    id="payment-note"
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    placeholder="Optional note for the audit trail"
                  />
                </div>
                <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
                  <Checkbox
                    id="payment-settles"
                    checked={settlesInFull}
                    onCheckedChange={(checked) => setSettlesInFull(checked === true)}
                  />
                  <Label htmlFor="payment-settles" className="text-sm leading-snug font-normal">
                    This settles the invoice in full — mark it as paid.
                    {outstanding != null && !paymentAmount.trim()
                      ? " Leaving the amount empty records the outstanding balance."
                      : ""}
                  </Label>
                </div>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog} disabled={loading !== null}>
                  Back
                </Button>
                <Button type="button" onClick={submitPayment} disabled={loading !== null}>
                  {loading === "payment"
                    ? "Recording..."
                    : settlesInFull
                      ? "Record & mark paid"
                      : "Record payment"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
