"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractedLineItem } from "@/lib/extraction";
import {
  canRequestCreditForLine,
  computeFuelCreditAmount,
  computeGstCreditAmount,
  computeInvoiceFuelRate,
  GST_RATE,
  parseFuelRatePercent,
} from "@/lib/credit-line-utils";
import { resolveLineItemStatus } from "@/lib/line-items";
import {
  CREDIT_REASON_OPTIONS,
  type CreditReasonCode,
} from "@/lib/credit-reasons";
import {
  formatCurrency,
  formatDecimalAmount,
  parseDecimalAmount,
} from "@/lib/format";

type CreditRequestSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  currency: string;
  selectedIndexes: number[];
  lineItems: ExtractedLineItem[];
};

type LineDraft = {
  lineIndex: number;
  lineNumber: number;
  description: string;
  serviceType: string | null;
  reference: string | null;
  invoiceAmount: number | null;
  requestedAmount: string;
  reason: CreditReasonCode | "";
  reasonDetail: string;
};

function formatAmountField(value: string) {
  const parsed = parseDecimalAmount(value);
  return parsed != null ? formatDecimalAmount(parsed) : value;
}

export function CreditRequestSheet({
  open,
  onOpenChange,
  invoiceId,
  currency,
  selectedIndexes,
  lineItems,
}: CreditRequestSheetProps) {
  const router = useRouter();
  const [draftOverrides, setDraftOverrides] = useState<Record<number, Partial<LineDraft>>>(
    {},
  );
  const [notes, setNotes] = useState("");
  const [includeFuel, setIncludeFuel] = useState(false);
  const [fuelRateInput, setFuelRateInput] = useState("");
  const [includeGst, setIncludeGst] = useState(false);
  const [requestedTotal, setRequestedTotal] = useState("");
  const [totalTouched, setTotalTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const baseDrafts = useMemo(() => {
    if (!open) return [];

    return selectedIndexes
      .map((lineIndex) => {
        const line = lineItems[lineIndex];
        if (!line) return null;
        return {
          lineIndex,
          lineNumber: line.lineNumber ?? lineIndex + 1,
          description: line.description,
          serviceType: line.serviceType ?? null,
          reference: line.reference ?? null,
          invoiceAmount: line.amount ?? null,
          requestedAmount:
            line.amount != null ? formatDecimalAmount(line.amount) : "",
          reason: "" as CreditReasonCode | "",
          reasonDetail: "",
        } satisfies LineDraft;
      })
      .filter((line): line is LineDraft => line !== null);
  }, [open, selectedIndexes, lineItems]);

  const drafts = useMemo(
    () =>
      baseDrafts.map((draft) => ({
        ...draft,
        ...draftOverrides[draft.lineIndex],
      })),
    [baseDrafts, draftOverrides],
  );

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setDraftOverrides({});
      setNotes("");
      setIncludeFuel(false);
      setFuelRateInput("");
      setIncludeGst(false);
      setRequestedTotal("");
      setTotalTouched(false);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  const fuelRate = useMemo(() => computeInvoiceFuelRate(lineItems), [lineItems]);

  const subtotal = useMemo(
    () =>
      drafts.reduce(
        (sum, line) => sum + (parseDecimalAmount(line.requestedAmount) ?? 0),
        0,
      ),
    [drafts],
  );

  const effectiveFuelRate = includeFuel
    ? parseFuelRatePercent(fuelRateInput)
    : null;

  const fuelAmount = useMemo(() => {
    if (!includeFuel || effectiveFuelRate == null) return null;
    return computeFuelCreditAmount(
      lineItems,
      drafts.map((line) => ({
        lineIndex: line.lineIndex,
        requestedAmount: parseDecimalAmount(line.requestedAmount),
      })),
      effectiveFuelRate,
    );
  }, [includeFuel, effectiveFuelRate, lineItems, drafts]);

  const gstAmount = includeGst
    ? computeGstCreditAmount(subtotal + (fuelAmount ?? 0))
    : null;

  const computedTotal = subtotal + (fuelAmount ?? 0) + (gstAmount ?? 0);
  const autoTotal =
    computedTotal > 0 ? formatDecimalAmount(computedTotal) : "";
  const displayTotal = totalTouched ? requestedTotal : autoTotal;

  const invalidSelection = selectedIndexes.some((index) => {
    const line = lineItems[index];
    if (!line) return true;
    return !canRequestCreditForLine(resolveLineItemStatus(line));
  });

  const validationError = useMemo(() => {
    if (drafts.length === 0) return "Select at least one line item.";
    for (const line of drafts) {
      if (!line.reason) return `Choose a reason for line ${line.lineNumber}.`;
      if (line.reason === "OTHER" && !line.reasonDetail.trim()) {
        return `Enter a custom reason for line ${line.lineNumber}.`;
      }
    }
    if (includeFuel && parseFuelRatePercent(fuelRateInput) == null) {
      return "Enter a fuel levy percentage between 0 and 100.";
    }
    return null;
  }, [drafts, includeFuel, fuelRateInput]);

  function updateDraft(lineIndex: number, patch: Partial<LineDraft>) {
    setDraftOverrides((current) => ({
      ...current,
      [lineIndex]: { ...current[lineIndex], ...patch },
    }));
  }

  async function handleSubmit() {
    if (invalidSelection || validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    const lines = drafts.map((line) => ({
      lineIndex: line.lineIndex,
      requestedAmount: parseDecimalAmount(line.requestedAmount),
      reason: line.reason as CreditReasonCode,
      reasonDetail: line.reason === "OTHER" ? line.reasonDetail.trim() : null,
    }));

    const response = await fetch(`/api/invoices/${invoiceId}/credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines,
        includeFuel,
        fuelRate: effectiveFuelRate,
        includeGst,
        requestedTotal: parseDecimalAmount(displayTotal),
        notes: notes.trim() || null,
      }),
    });

    setLoading(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Failed to create credit request");
      return;
    }

    handleOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Create credit request</SheetTitle>
          <SheetDescription>
            Review each selected line, set the credit amount, and choose a reason. A spreadsheet
            will be generated for carrier submission.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {invalidSelection ? (
            <p className="text-sm text-destructive">
              One or more selected lines already have an open credit request or approved credit.
            </p>
          ) : null}

          {drafts.map((line) => (
            <section
              key={line.lineIndex}
              className="space-y-4 rounded-xl border bg-muted/20 p-4"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Line {line.lineNumber} · {line.description}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {line.serviceType ? <span>Service: {line.serviceType}</span> : null}
                  {line.reference ? <span>Reference: {line.reference}</span> : null}
                  {line.invoiceAmount != null ? (
                    <span>Invoiced: {formatCurrency(line.invoiceAmount, currency)}</span>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`credit-amount-${line.lineIndex}`}>Credit amount</Label>
                  <Input
                    id={`credit-amount-${line.lineIndex}`}
                    inputMode="decimal"
                    value={line.requestedAmount}
                    onChange={(event) =>
                      updateDraft(line.lineIndex, { requestedAmount: event.target.value })
                    }
                    onBlur={() =>
                      updateDraft(line.lineIndex, {
                        requestedAmount: formatAmountField(line.requestedAmount),
                      })
                    }
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`credit-reason-${line.lineIndex}`}>Reason</Label>
                  <Select
                    items={CREDIT_REASON_OPTIONS.map((option) => ({
                      label: option.label,
                      value: option.code,
                    }))}
                    value={line.reason || undefined}
                    onValueChange={(value) => {
                      if (!value) return;
                      updateDraft(line.lineIndex, {
                        reason: value as CreditReasonCode,
                        reasonDetail: value === "OTHER" ? line.reasonDetail : "",
                      });
                    }}
                  >
                    <SelectTrigger id={`credit-reason-${line.lineIndex}`} className="w-full">
                      <SelectValue placeholder="Select a reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {CREDIT_REASON_OPTIONS.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {line.reason ? (
                    <p className="text-xs text-muted-foreground">
                      {
                        CREDIT_REASON_OPTIONS.find((option) => option.code === line.reason)
                          ?.description
                      }
                    </p>
                  ) : null}
                </div>

                {line.reason === "OTHER" ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`credit-reason-detail-${line.lineIndex}`}>
                      Custom reason
                    </Label>
                    <Input
                      id={`credit-reason-detail-${line.lineIndex}`}
                      value={line.reasonDetail}
                      onChange={(event) =>
                        updateDraft(line.lineIndex, { reasonDetail: event.target.value })
                      }
                      placeholder="Describe why this line should be credited"
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ))}

          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-start gap-2">
              <Checkbox
                id="credit-include-fuel"
                checked={includeFuel}
                onCheckedChange={(checked) => {
                  const next = checked === true;
                  setIncludeFuel(next);
                  if (next && !fuelRateInput && fuelRate != null) {
                    setFuelRateInput((fuelRate * 100).toFixed(2));
                  }
                }}
              />
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="credit-include-fuel">Include fuel surcharge</Label>
                <p className="text-xs text-muted-foreground">
                  {fuelRate == null
                    ? "No fuel surcharge detected on this invoice — enter the levy manually."
                    : `Invoice fuel levy detected at ${(fuelRate * 100).toFixed(2)}% — adjust if the carrier's rate differs.`}
                </p>
                {includeFuel ? (
                  <div className="flex items-center gap-2">
                    <Input
                      id="credit-fuel-rate"
                      inputMode="decimal"
                      value={fuelRateInput}
                      onChange={(event) => setFuelRateInput(event.target.value)}
                      placeholder={fuelRate != null ? (fuelRate * 100).toFixed(2) : "e.g. 10.5"}
                      aria-label="Fuel levy percentage"
                      className="w-24"
                    />
                    <span className="text-xs text-muted-foreground">
                      % fuel levy
                      {fuelAmount != null
                        ? ` adds ${formatCurrency(fuelAmount, currency)}.`
                        : ""}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="credit-include-gst"
                checked={includeGst}
                onCheckedChange={(checked) => setIncludeGst(checked === true)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="credit-include-gst">
                  Include GST ({Math.round(GST_RATE * 100)}%)
                </Label>
                <p className="text-xs text-muted-foreground">
                  {includeGst && gstAmount != null
                    ? `Adds ${formatCurrency(gstAmount, currency)} GST on top of the credited amount.`
                    : "Adds GST on top of the credited amount."}
                </p>
              </div>
            </div>

            <Label htmlFor="credit-total">Credit total</Label>
            <Input
              id="credit-total"
              inputMode="decimal"
              value={displayTotal}
              onChange={(event) => {
                setTotalTouched(true);
                setRequestedTotal(event.target.value);
              }}
              onBlur={() => {
                if (!totalTouched) return;
                setRequestedTotal(formatAmountField(displayTotal));
              }}
              placeholder="0.00"
              className="max-w-xs"
            />
            {!totalTouched && autoTotal ? (
              <p className="text-xs text-muted-foreground">
                Total updates automatically from line amounts until you edit it.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="credit-notes">Additional notes for carrier</Label>
            <Textarea
              id="credit-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes to include on the submission spreadsheet"
              rows={3}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <SheetFooter className="border-t px-6 py-4 sm:flex-row">
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
            onClick={() => void handleSubmit()}
            disabled={loading || invalidSelection || drafts.length === 0}
          >
            {loading ? "Creating..." : "Create credit request"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
