"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
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
import { computeGstCreditAmount, GST_RATE } from "@/lib/credit-line-utils";
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
};

type LineDraft = {
  key: number;
  description: string;
  requestedAmount: string;
  quantity: string;
  reference: string;
  reason: CreditReasonCode | "";
  reasonDetail: string;
};

function emptyLine(key: number): LineDraft {
  return {
    key,
    description: "",
    requestedAmount: "",
    quantity: "",
    reference: "",
    reason: "",
    reasonDetail: "",
  };
}

function formatAmountField(value: string) {
  const parsed = parseDecimalAmount(value);
  return parsed != null ? formatDecimalAmount(parsed) : value;
}

export function CreditRequestSheet({
  open,
  onOpenChange,
  invoiceId,
  currency,
}: CreditRequestSheetProps) {
  const router = useRouter();
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(0)]);
  const [nextKey, setNextKey] = useState(1);
  const [notes, setNotes] = useState("");
  const [includeGst, setIncludeGst] = useState(false);
  const [requestedTotal, setRequestedTotal] = useState("");
  const [totalTouched, setTotalTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setLines([emptyLine(0)]);
      setNextKey(1);
      setNotes("");
      setIncludeGst(false);
      setRequestedTotal("");
      setTotalTouched(false);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine(nextKey)]);
    setNextKey((key) => key + 1);
  }

  function removeLine(key: number) {
    setLines((current) =>
      current.length > 1 ? current.filter((line) => line.key !== key) : current,
    );
  }

  const subtotal = lines.reduce(
    (sum, line) => sum + (parseDecimalAmount(line.requestedAmount) ?? 0),
    0,
  );
  const gstAmount = includeGst ? computeGstCreditAmount(subtotal) : null;
  const computedTotal = subtotal + (gstAmount ?? 0);
  const autoTotal = computedTotal > 0 ? formatDecimalAmount(computedTotal) : "";
  const displayTotal = totalTouched ? requestedTotal : autoTotal;

  function validationError(): string | null {
    for (const [index, line] of lines.entries()) {
      const label = `line ${index + 1}`;
      if (!line.description.trim()) return `Enter a description for ${label}.`;
      const amount = parseDecimalAmount(line.requestedAmount);
      if (amount == null || amount <= 0) return `Enter a credit amount for ${label}.`;
      if (!line.reason) return `Choose a reason for ${label}.`;
      if (line.reason === "OTHER" && !line.reasonDetail.trim()) {
        return `Enter a custom reason for ${label}.`;
      }
    }
    return null;
  }

  async function handleSubmit() {
    const problem = validationError();
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    setError(null);

    const payload = lines.map((line) => ({
      description: line.description.trim(),
      requestedAmount: parseDecimalAmount(line.requestedAmount),
      quantity: parseDecimalAmount(line.quantity),
      reference: line.reference.trim() || null,
      reason: line.reason as CreditReasonCode,
      reasonDetail: line.reason === "OTHER" ? line.reasonDetail.trim() : null,
    }));

    const response = await fetch(`/api/invoices/${invoiceId}/credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: payload,
        includeGst,
        requestedTotal: parseDecimalAmount(displayTotal),
        notes: notes.trim() || null,
      }),
    });

    setLoading(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to create credit request");
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
            Add each charge you want credited with its amount and reason. A
            spreadsheet will be generated for carrier submission.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {lines.map((line, index) => (
            <section
              key={line.key}
              className="space-y-4 rounded-xl border bg-muted/20 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Credit line {index + 1}</p>
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() => removeLine(line.key)}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`credit-description-${line.key}`}>Description</Label>
                  <Input
                    id={`credit-description-${line.key}`}
                    value={line.description}
                    onChange={(event) =>
                      updateLine(line.key, { description: event.target.value })
                    }
                    placeholder="e.g. Fuel surcharge overcharged on consignment 12345"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`credit-amount-${line.key}`}>Credit amount</Label>
                  <Input
                    id={`credit-amount-${line.key}`}
                    inputMode="decimal"
                    value={line.requestedAmount}
                    onChange={(event) =>
                      updateLine(line.key, { requestedAmount: event.target.value })
                    }
                    onBlur={() =>
                      updateLine(line.key, {
                        requestedAmount: formatAmountField(line.requestedAmount),
                      })
                    }
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`credit-reference-${line.key}`}>
                    Reference{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id={`credit-reference-${line.key}`}
                    value={line.reference}
                    onChange={(event) =>
                      updateLine(line.key, { reference: event.target.value })
                    }
                    placeholder="Consignment / con note"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`credit-reason-${line.key}`}>Reason</Label>
                  <Select
                    items={CREDIT_REASON_OPTIONS.map((option) => ({
                      label: option.label,
                      value: option.code,
                    }))}
                    value={line.reason || undefined}
                    onValueChange={(value) => {
                      if (!value) return;
                      updateLine(line.key, {
                        reason: value as CreditReasonCode,
                        reasonDetail: value === "OTHER" ? line.reasonDetail : "",
                      });
                    }}
                  >
                    <SelectTrigger id={`credit-reason-${line.key}`} className="w-full">
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
                    <Label htmlFor={`credit-reason-detail-${line.key}`}>
                      Custom reason
                    </Label>
                    <Input
                      id={`credit-reason-detail-${line.key}`}
                      value={line.reasonDetail}
                      onChange={(event) =>
                        updateLine(line.key, { reasonDetail: event.target.value })
                      }
                      placeholder="Describe why this charge should be credited"
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <PlusIcon data-icon="inline-start" />
            Add credit line item
          </Button>

          <div className="space-y-3 rounded-xl border p-4">
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
          <Button type="button" onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? "Creating..." : "Create credit request"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
