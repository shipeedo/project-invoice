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
import { formatDecimalAmount, parseDecimalAmount } from "@/lib/format";

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
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    const payload: {
      action: "record_outcome";
      outcome: "approved" | "denied";
      approvedAmount?: number;
    } = {
      action: "record_outcome",
      outcome,
    };

    if (outcome === "approved") {
      const amount = parseDecimalAmount(approvedAmount);
      if (amount == null || amount <= 0) {
        setLoading(false);
        setError("Approved amount is required");
        return;
      }
      payload.approvedAmount = amount;
    }

    const response = await fetch(`/api/credit-requests/${creditRequestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
