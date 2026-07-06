"use client";

import { CheckIcon, PencilIcon, PlusIcon, Wand2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExtractedLineItem } from "@/lib/extraction";
import type { ExtractionCandidates, FieldCandidate, ValidatableField } from "@/lib/extraction-types";
import {
  computeLineItemTotals,
  type InvoiceTotals,
  type InvoiceTotalsSource,
} from "@/lib/invoice-totals";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type SupplierOption = {
  id: string;
  name: string;
};

type InvoiceValidationPanelProps = {
  invoiceId: string;
  status: string;
  candidates: ExtractionCandidates | null;
  initialFields: {
    vendorName: string;
    vendorEmail: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    respondByDate: string;
    totalAmount: string;
    currency: string;
  };
  lineItems: ExtractedLineItem[];
  supplierId: string | null;
  supplierName: string | null;
  suppliers: SupplierOption[];
  /** Subtotal and GST extracted from the invoice document; the document total lives in initialFields. */
  extractedTotals: { subtotal: number | null; taxAmount: number | null };
  /** Rendered beside the review card so the line items span the full width below. */
  sourceSlot?: React.ReactNode;
};

type FieldConfig = {
  key: ValidatableField;
  label: string;
  type: "text" | "date" | "number";
};

const FIELD_CONFIG: FieldConfig[] = [
  { key: "vendorName", label: "Supplier", type: "text" },
  { key: "vendorEmail", label: "Supplier email", type: "text" },
  { key: "invoiceNumber", label: "Invoice no.", type: "text" },
  { key: "invoiceDate", label: "Invoice date", type: "date" },
  { key: "dueDate", label: "Due date", type: "date" },
  { key: "respondByDate", label: "Respond by", type: "date" },
  { key: "totalAmount", label: "Total", type: "number" },
  { key: "currency", label: "Currency", type: "text" },
];

function uniqueCandidates(
  field: ValidatableField,
  candidates: ExtractionCandidates | null,
  currentValue: string,
): FieldCandidate[] {
  const fromAi = candidates?.[field] ?? [];
  const seen = new Set<string>();
  const merged: FieldCandidate[] = [];

  for (const candidate of fromAi) {
    const key = `${candidate.source}:${candidate.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }

  if (currentValue.trim()) {
    const key = `manual:${currentValue}`;
    if (!seen.has(key) && !merged.some((entry) => entry.value === currentValue)) {
      merged.unshift({
        value: currentValue,
        label: currentValue,
        source: "selected",
      });
    }
  }

  return merged;
}

function formatSourceLabel(source: string) {
  return source.replaceAll("_", " ");
}

function formatDisplayValue(
  key: ValidatableField,
  value: string,
  currency: string,
): string {
  if (!value.trim()) return "—";

  if (key === "invoiceDate" || key === "dueDate" || key === "respondByDate") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(date);
    }
  }

  if (key === "totalAmount") {
    const amount = Number(value);
    if (!Number.isNaN(amount)) {
      return formatCurrency(amount, currency || "AUD");
    }
  }

  return value;
}

type SupplierFeaturedOptionProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone?: "create" | "matched";
};

function SupplierFeaturedOption({
  icon,
  title,
  description,
  tone = "create",
}: SupplierFeaturedOptionProps) {
  return (
    <span className="flex items-center gap-3 py-1">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          tone === "create"
            ? "bg-primary/10 text-primary"
            : "bg-secondary text-secondary-foreground",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 text-left">
        <span className="text-sm font-semibold leading-tight">{title}</span>
        <span className="text-xs leading-snug text-muted-foreground">{description}</span>
      </span>
    </span>
  );
}

function SupplierSelectTriggerLabel({
  createSupplier,
  supplierId,
  initialSupplierId,
  supplierName,
  suppliers,
}: {
  createSupplier: boolean;
  supplierId: string;
  initialSupplierId: string | null;
  supplierName: string | null;
  suppliers: SupplierOption[];
}) {
  if (createSupplier) {
    return (
      <span className="flex items-center gap-2">
        <PlusIcon className="size-4 shrink-0 text-primary" />
        <span className="font-medium">Create from confirmed name</span>
      </span>
    );
  }

  if (initialSupplierId && supplierId === initialSupplierId && supplierName) {
    return (
      <span className="flex items-center gap-2">
        <Wand2Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">Matched: {supplierName}</span>
      </span>
    );
  }

  const supplier = suppliers.find((entry) => entry.id === supplierId);
  return supplier?.name ?? null;
}

type ValidationFieldRowProps = {
  config: FieldConfig;
  value: string;
  currency: string;
  options: FieldCandidate[];
  selectedSource?: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onDoneEdit: () => void;
  onChange: (value: string) => void;
  onApplyCandidate: (candidate: FieldCandidate) => void;
};

function ValidationFieldRow({
  config,
  value,
  currency,
  options,
  selectedSource,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onDoneEdit,
  onChange,
  onApplyCandidate,
}: ValidationFieldRowProps) {
  const displayValue = formatDisplayValue(config.key, value, currency);
  const hasSuggestions = options.length > 0;

  if (isEditing) {
    return (
      <div className="col-span-full flex flex-col gap-3 rounded-lg bg-muted/40 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={config.key} className="text-sm font-medium">
            {config.label}
          </Label>
          <div className="flex items-center gap-1">
            <Button type="button" size="xs" onClick={onDoneEdit}>
              <CheckIcon data-icon="inline-start" />
              Done
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>

        <Input
          id={config.key}
          type={config.type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={config.key === "vendorName"}
          autoFocus
        />

        {hasSuggestions ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              From email and attachments
            </p>
            <div className="flex flex-wrap gap-1.5">
              {options.map((candidate) => {
                const isSelected =
                  value === candidate.value && selectedSource === candidate.source;

                return (
                  <button
                    key={`${candidate.source}-${candidate.value}`}
                    type="button"
                    className="max-w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onApplyCandidate(candidate)}
                  >
                    <Badge
                      variant={isSelected ? "default" : "outline"}
                      className="h-auto max-w-full py-1 whitespace-normal"
                      title={formatSourceLabel(candidate.source)}
                    >
                      {candidate.label}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No other values found in the source.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="group/field grid grid-cols-[7rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-2">
      <span className="text-sm text-muted-foreground">{config.label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-sm",
          displayValue === "—" ? "text-muted-foreground" : "font-medium",
        )}
      >
        {displayValue}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="opacity-0 transition-opacity group-hover/field:opacity-100 focus-visible:opacity-100"
        aria-label={`Edit ${config.label.toLowerCase()}`}
        onClick={onStartEdit}
      >
        <PencilIcon />
      </Button>
    </div>
  );
}

function formatTotalsValue(value: number | null, currency: string) {
  return value != null ? formatCurrency(value, currency || "AUD") : "—";
}

type TotalsOptionCardProps = {
  title: string;
  description: string;
  totals: InvoiceTotals;
  currency: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

function TotalsOptionCard({
  title,
  description,
  totals,
  currency,
  selected,
  disabled = false,
  onSelect,
}: TotalsOptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "hover:border-muted-foreground/40",
        disabled && "cursor-not-allowed opacity-50 hover:border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
          )}
        >
          {selected ? <CheckIcon className="size-3" /> : null}
        </span>
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Subtotal (excl. GST)</dt>
          <dd className="font-medium">{formatTotalsValue(totals.subtotal, currency)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">GST</dt>
          <dd className="font-medium">{formatTotalsValue(totals.taxAmount, currency)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t pt-1">
          <dt className="text-muted-foreground">Total (incl. GST)</dt>
          <dd className="font-semibold">{formatTotalsValue(totals.total, currency)}</dd>
        </div>
      </dl>
    </button>
  );
}

export function InvoiceValidationPanel({
  invoiceId,
  status,
  candidates,
  initialFields,
  lineItems,
  supplierId: initialSupplierId,
  supplierName,
  suppliers,
  extractedTotals,
  sourceSlot,
}: InvoiceValidationPanelProps) {
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  const [editingFields, setEditingFields] = useState<Partial<Record<ValidatableField, string>>>(
    {},
  );
  const [selectedSources, setSelectedSources] = useState<
    Partial<Record<ValidatableField, string>>
  >({});
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "none");
  const [createSupplier, setCreateSupplier] = useState(!initialSupplierId);
  // Line indexes deselected for routing; empty means every line is included.
  const [rejectedLines, setRejectedLines] = useState<Set<number>>(new Set());
  const [totalsSource, setTotalsSource] = useState<InvoiceTotalsSource>(() =>
    initialFields.totalAmount || lineItems.length === 0 ? "DOCUMENT" : "LINE_ITEMS",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canValidate = status === "DRAFT";

  const fieldOptions = useMemo(() => {
    return FIELD_CONFIG.reduce(
      (acc, config) => {
        acc[config.key] = uniqueCandidates(
          config.key,
          candidates,
          fields[config.key],
        );
        return acc;
      },
      {} as Record<ValidatableField, FieldCandidate[]>,
    );
  }, [candidates, fields]);

  const supplierSelectItems = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [
      { label: "Create from confirmed name", value: "create" },
    ];

    if (supplierName && initialSupplierId) {
      items.push({
        label: `Matched: ${supplierName}`,
        value: initialSupplierId,
      });
    }

    for (const supplier of suppliers) {
      if (supplier.id !== initialSupplierId) {
        items.push({ label: supplier.name, value: supplier.id });
      }
    }

    return items;
  }, [suppliers, initialSupplierId, supplierName]);

  if (!canValidate) {
    return null;
  }

  const selectedLineCount = lineItems.length - rejectedLines.size;
  const allLinesSelected = lineItems.length > 0 && rejectedLines.size === 0;
  const someLinesSelected =
    rejectedLines.size > 0 && rejectedLines.size < lineItems.length;
  const noLinesSelected = lineItems.length > 0 && selectedLineCount === 0;

  const documentTotal = Number(fields.totalAmount);
  const documentTotals: InvoiceTotals = {
    subtotal: extractedTotals.subtotal,
    taxAmount: extractedTotals.taxAmount,
    total:
      fields.totalAmount.trim() && Number.isFinite(documentTotal)
        ? documentTotal
        : null,
  };
  const selectedLineTotals = computeLineItemTotals(
    lineItems.filter((_, index) => !rejectedLines.has(index)),
  );
  // Fall back to the document totals when the selected lines can't produce any.
  const effectiveTotalsSource: InvoiceTotalsSource =
    totalsSource === "LINE_ITEMS" && selectedLineTotals.total == null
      ? "DOCUMENT"
      : totalsSource;

  function toggleAllLines(checked: boolean) {
    if (checked) {
      setRejectedLines(new Set());
    } else {
      setRejectedLines(new Set(lineItems.map((_, index) => index)));
    }
  }

  function toggleLine(index: number, checked: boolean) {
    setRejectedLines((current) => {
      const next = new Set(current);
      if (checked) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function updateField(key: ValidatableField, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function applyCandidate(field: ValidatableField, candidate: FieldCandidate) {
    updateField(field, candidate.value);
    setSelectedSources((current) => ({ ...current, [field]: candidate.source }));
  }

  function startEditing(field: ValidatableField) {
    setEditingFields((current) => ({
      ...current,
      [field]: fields[field],
    }));
  }

  function cancelEditing(field: ValidatableField) {
    const previous = editingFields[field];
    if (previous !== undefined) {
      updateField(field, previous);
    }
    setEditingFields((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function finishEditing(field: ValidatableField) {
    setEditingFields((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (noLinesSelected) {
      setError("Select at least one line item to route for approval");
      return;
    }

    setLoading(true);
    setError(null);

    const payload: Record<string, unknown> = {
      fields: {
        vendorName: fields.vendorName,
        vendorEmail: fields.vendorEmail || null,
        invoiceNumber: fields.invoiceNumber || null,
        invoiceDate: fields.invoiceDate || null,
        dueDate: fields.dueDate || null,
        respondByDate: fields.respondByDate || null,
        totalAmount: fields.totalAmount ? Number(fields.totalAmount) : null,
        currency: fields.currency || "AUD",
      },
      lineItems,
      selectedSources,
      rejectedLineIndexes: [...rejectedLines].sort((a, b) => a - b),
      totalsSource: effectiveTotalsSource,
    };

    if (createSupplier) {
      payload.createSupplier = {
        name: fields.vendorName,
        emailAddresses: fields.vendorEmail ? [fields.vendorEmail] : [],
      };
    } else if (supplierId !== "none") {
      payload.supplierId = supplierId;
    }

    const response = await fetch(`/api/invoices/${invoiceId}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Validation failed");
      return;
    }

    router.refresh();
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Review extraction</CardTitle>
            <CardDescription>
              Check each field against the source. Edit only what needs correcting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form id="invoice-validation-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center">
                <Label htmlFor="linked-supplier" className="text-sm text-muted-foreground">
                  Supplier
                </Label>
                <Select
                  items={supplierSelectItems}
                  value={createSupplier ? "create" : supplierId}
                  onValueChange={(value) => {
                    if (!value || value === "create") {
                      setCreateSupplier(true);
                      setSupplierId("none");
                    } else {
                      setCreateSupplier(false);
                      setSupplierId(value);
                    }
                  }}
                >
                  <SelectTrigger id="linked-supplier" className="h-10 w-full">
                    <SelectValue placeholder="Select supplier">
                      <SupplierSelectTriggerLabel
                        createSupplier={createSupplier}
                        supplierId={supplierId}
                        initialSupplierId={initialSupplierId}
                        supplierName={supplierName}
                        suppliers={suppliers}
                      />
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} className="min-w-[var(--anchor-width)]">
                    <SelectGroup>
                      <SelectItem value="create" className="py-2.5 pl-2">
                        <SupplierFeaturedOption
                          tone="create"
                          icon={<PlusIcon className="size-5" />}
                          title="Create from confirmed name"
                          description="Add a new supplier using the confirmed fields"
                        />
                      </SelectItem>
                      {supplierName && initialSupplierId ? (
                        <SelectItem value={initialSupplierId} className="py-2.5 pl-2">
                          <SupplierFeaturedOption
                            tone="matched"
                            icon={<Wand2Icon className="size-5" />}
                            title={`Matched: ${supplierName}`}
                            description="Use the supplier linked from this email"
                          />
                        </SelectItem>
                      ) : null}
                    </SelectGroup>
                    {suppliers.some((supplier) => supplier.id !== initialSupplierId) ? (
                      <>
                        <SelectSeparator />
                        <SelectGroup>
                          {suppliers
                            .filter((supplier) => supplier.id !== initialSupplierId)
                            .map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                {supplier.name}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="grid gap-x-10 sm:grid-cols-2">
                {FIELD_CONFIG.map((config) => (
                  <ValidationFieldRow
                    key={config.key}
                    config={config}
                    value={fields[config.key]}
                    currency={fields.currency}
                    options={fieldOptions[config.key]}
                    selectedSource={selectedSources[config.key]}
                    isEditing={config.key in editingFields}
                    onStartEdit={() => startEditing(config.key)}
                    onCancelEdit={() => cancelEditing(config.key)}
                    onDoneEdit={() => finishEditing(config.key)}
                    onChange={(value) => updateField(config.key, value)}
                    onApplyCandidate={(candidate) => applyCandidate(config.key, candidate)}
                  />
                ))}
              </div>
            </form>
          </CardContent>
        </Card>

        {sourceSlot}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Line items</CardTitle>
          <CardDescription>
            All line items are included by default. Deselect any you don&apos;t want
            to route for approval — they will be marked rejected.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No line items extracted.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allLinesSelected}
                      indeterminate={someLinesSelected}
                      onCheckedChange={(checked) => toggleAllLines(checked === true)}
                      aria-label="Select all line items"
                    />
                  </TableHead>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="min-w-[12rem]">Description</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item, index) => {
                  const isSelected = !rejectedLines.has(index);
                  return (
                    <TableRow
                      key={`${item.lineNumber ?? index}-${item.description}`}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(
                        "cursor-pointer",
                        !isSelected && "text-muted-foreground line-through",
                      )}
                      onClick={() => toggleLine(index, !isSelected)}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            toggleLine(index, checked === true)
                          }
                          aria-label={`Select line ${item.lineNumber ?? index + 1}`}
                        />
                      </TableCell>
                      <TableCell>{item.lineNumber ?? index + 1}</TableCell>
                      <TableCell className="max-w-md whitespace-normal">{item.description}</TableCell>
                      <TableCell>{item.serviceType ?? "—"}</TableCell>
                      <TableCell>{item.quantity ?? "—"}</TableCell>
                      <TableCell>
                        {item.unitPrice != null
                          ? formatCurrency(item.unitPrice, fields.currency || "AUD")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {item.amount != null
                          ? formatCurrency(item.amount, fields.currency || "AUD")
                          : "—"}
                      </TableCell>
                      <TableCell>{item.reference ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {lineItems.length > 0 ? (
            <div className="space-y-3" role="radiogroup" aria-label="Invoice totals">
              <div>
                <h3 className="text-sm font-semibold">Invoice totals</h3>
                <p className="text-xs text-muted-foreground">
                  Choose which totals are saved on the invoice.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TotalsOptionCard
                  title="From invoice document"
                  description="As extracted from the document; the total matches the Total field above."
                  totals={documentTotals}
                  currency={fields.currency}
                  selected={effectiveTotalsSource === "DOCUMENT"}
                  onSelect={() => setTotalsSource("DOCUMENT")}
                />
                <TotalsOptionCard
                  title="From selected line items"
                  description={`Sum of the ${selectedLineCount} selected line item${selectedLineCount === 1 ? "" : "s"} plus 10% GST.`}
                  totals={selectedLineTotals}
                  currency={fields.currency}
                  selected={effectiveTotalsSource === "LINE_ITEMS"}
                  disabled={selectedLineTotals.total == null}
                  onSelect={() => setTotalsSource("LINE_ITEMS")}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3 border-t">
          <p className="text-sm text-muted-foreground">
            {lineItems.length === 0
              ? "No line items to include."
              : noLinesSelected
                ? "Select at least one line item to route for approval."
                : `${selectedLineCount} of ${lineItems.length} line item${lineItems.length === 1 ? "" : "s"} will be routed for approval.`}
          </p>
          <Button
            type="submit"
            form="invoice-validation-form"
            disabled={loading || noLinesSelected}
          >
            {loading ? "Confirming..." : "Confirm and route for approval"}
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
