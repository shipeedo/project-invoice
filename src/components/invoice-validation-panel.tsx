"use client";

import { PlusIcon, SparklesIcon, TriangleAlertIcon, Wand2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SupplierCandidateCard,
  type SupplierCandidate,
} from "@/components/supplier-candidate";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

type SupplierOption = {
  id: string;
  name: string;
};

/** Mirrors the server-side supplier name comparison in supplier-extraction.ts. */
function normalizeForMatch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

type ValidationFieldKey =
  | "vendorName"
  | "vendorEmail"
  | "invoiceNumber"
  | "invoiceDate"
  | "dueDate"
  | "respondByDate"
  | "totalAmount"
  | "subtotalAmount"
  | "taxAmount"
  | "currency";

type ValidationFields = Record<ValidationFieldKey, string>;

type InvoiceValidationPanelProps = {
  invoiceId: string;
  status: string;
  initialFields: ValidationFields;
  supplierId: string | null;
  supplierName: string | null;
  suppliers: SupplierOption[];
  /** Whether the invoice has a source email thread the AI can read. */
  canExtractSupplier?: boolean;
  /** Inline document previews rendered beside the fields being confirmed. */
  sourceSlot?: React.ReactNode;
};

type FieldConfig = {
  key: ValidationFieldKey;
  label: string;
  type: "text" | "date" | "number";
};

const SUPPLIER_FIELDS: FieldConfig[] = [
  { key: "vendorName", label: "Supplier name", type: "text" },
  { key: "vendorEmail", label: "Supplier email", type: "text" },
];

const INVOICE_FIELDS: FieldConfig[] = [
  { key: "invoiceNumber", label: "Invoice no.", type: "text" },
  { key: "invoiceDate", label: "Invoice date", type: "date" },
  { key: "dueDate", label: "Due date", type: "date" },
  { key: "respondByDate", label: "Respond by", type: "date" },
  { key: "subtotalAmount", label: "Subtotal", type: "number" },
  { key: "taxAmount", label: "GST", type: "number" },
  { key: "totalAmount", label: "Total", type: "number" },
  { key: "currency", label: "Currency", type: "text" },
];

/** Invoicing platforms whose "from" address is not the supplier's own inbox. */
const PLATFORM_EMAIL_LABELS: Record<string, string> = {
  xero: "Xero",
  myob: "MYOB",
};

/** Returns the platform name (e.g. "Xero") when an email is sent via an
 * invoicing platform rather than the supplier's own domain. */
function detectPlatformEmail(email: string): string | null {
  const at = email.indexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return null;
  for (const label of domain.split(".")) {
    if (PLATFORM_EMAIL_LABELS[label]) return PLATFORM_EMAIL_LABELS[label];
  }
  return null;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
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

export function InvoiceValidationPanel({
  invoiceId,
  status,
  initialFields,
  supplierId: initialSupplierId,
  supplierName,
  suppliers,
  canExtractSupplier = false,
  sourceSlot,
}: InvoiceValidationPanelProps) {
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "none");
  const [createSupplier, setCreateSupplier] = useState(!initialSupplierId);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [candidates, setCandidates] = useState<SupplierCandidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(
    null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  // Set once the reviewer picks a supplier themselves, after which the
  // confirmed name never moves the selection for them.
  const [supplierPickedByUser, setSupplierPickedByUser] = useState(false);
  const [supplierRelinkNote, setSupplierRelinkNote] = useState<string | null>(null);
  // A pre-filled link may legitimately not match the extracted name (it can be
  // matched on the supplier's email domain instead), so only an edit to the
  // name puts the selection in question.
  const [vendorNameEdited, setVendorNameEdited] = useState(false);

  const canValidate = status === "DRAFT";

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

  function updateField(key: ValidationFieldKey, value: string) {
    if (key === "vendorName") setVendorNameEdited(true);
    setFields((current) => ({ ...current, [key]: value }));
  }

  /**
   * Re-resolves the linked supplier once the confirmed name is finished being
   * edited.
   *
   * The select is pre-filled with the supplier extraction matched, so leaving it
   * alone while retyping the name is the easy path — and it saves an invoice
   * whose header names one company and whose queue row names another. Runs on
   * blur rather than per keystroke so it doesn't fight the reviewer mid-word,
   * and never overrides a supplier they picked themselves.
   */
  function realignSupplierToConfirmedName() {
    if (!vendorNameEdited || supplierPickedByUser || createSupplier) return;

    const name = normalizeForMatch(fields.vendorName);
    if (!name) return;

    const selected = suppliers.find((entry) => entry.id === supplierId);
    if (!selected || normalizeForMatch(selected.name) === name) {
      setSupplierRelinkNote(null);
      return;
    }

    const rematched = suppliers.find(
      (entry) => normalizeForMatch(entry.name) === name,
    );

    if (rematched) {
      setSupplierId(rematched.id);
      setSupplierRelinkNote(
        `Confirmed name no longer matches ${selected.name}, so this invoice will link to ${rematched.name}.`,
      );
      return;
    }

    setSupplierId("none");
    setCreateSupplier(true);
    setSupplierRelinkNote(
      `Confirmed name no longer matches ${selected.name}, so a new supplier will be created. Pick an existing supplier above to link to that instead.`,
    );
  }

  /** Fill the supplier fields from a candidate and collapse the picker so the
   * form fields are the single source of truth for what gets saved. */
  function chooseCandidate(candidate: SupplierCandidate, index: number) {
    setSelectedCandidateIndex(index);
    setCreateSupplier(true);
    setSupplierId("none");
    setPickerOpen(false);
    setFields((current) => ({
      ...current,
      vendorName: candidate.company ?? current.vendorName,
      vendorEmail: candidate.senderEmail ?? current.vendorEmail,
    }));
  }

  async function handleFillWithAi() {
    setExtracting(true);
    setExtractError(null);
    setCandidates([]);
    setSelectedCandidateIndex(null);
    setPickerOpen(false);

    const response = await fetch(`/api/invoices/${invoiceId}/extract-supplier`, {
      method: "POST",
    });

    setExtracting(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setExtractError(payload.error ?? "Failed to read supplier details");
      return;
    }

    const payload = (await response.json()) as {
      candidates: SupplierCandidate[];
      recommendedIndex: number;
    };

    const next = payload.candidates ?? [];
    setCandidates(next);

    if (next.length === 0) {
      setExtractError("AI could not identify a supplier in this email.");
      return;
    }

    const recommendedIndex =
      payload.recommendedIndex >= 0 && payload.recommendedIndex < next.length
        ? payload.recommendedIndex
        : 0;

    // Pre-fill the recommended match. If several organisations were found, open
    // the picker so the reviewer can choose; otherwise just fill the fields.
    chooseCandidate(next[recommendedIndex], recommendedIndex);
    if (next.length > 1) {
      setPickerOpen(true);
    }
  }

  function numberOrNull(value: string) {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

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
        totalAmount: numberOrNull(fields.totalAmount),
        subtotalAmount: numberOrNull(fields.subtotalAmount),
        taxAmount: numberOrNull(fields.taxAmount),
        currency: fields.currency || "AUD",
      },
    };

    if (createSupplier) {
      payload.createSupplier = {
        name: fields.vendorName,
        emailAddresses: fields.vendorEmail ? [fields.vendorEmail] : [],
      };
    } else if (supplierId !== "none" && !staleSupplierSelection) {
      payload.supplierId = supplierId;
    }
    // A stale selection is deliberately left out so the server re-resolves the
    // link from the confirmed name and email rather than pinning the supplier
    // the reviewer just typed over. Submitting via Enter can skip the blur that
    // would otherwise have realigned the select.

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

  const selectedCandidate =
    selectedCandidateIndex != null ? candidates[selectedCandidateIndex] : null;
  const platformEmail = detectPlatformEmail(fields.vendorEmail);

  // A pre-filled selection the reviewer never confirmed, on an invoice whose
  // supplier name they have since changed.
  const selectedSupplier = suppliers.find((entry) => entry.id === supplierId);
  const staleSupplierSelection =
    vendorNameEdited &&
    !supplierPickedByUser &&
    selectedSupplier != null &&
    normalizeForMatch(fields.vendorName).length > 0 &&
    normalizeForMatch(selectedSupplier.name) !== normalizeForMatch(fields.vendorName);

  const supplierActionSummary = createSupplier
    ? `A new supplier "${fields.vendorName || "…"}" will be created and linked.`
    : supplierId !== "none"
      ? "The invoice will be linked to the selected supplier."
      : "Choose or create a supplier to link this invoice to.";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] xl:items-start">
      <Card className="min-w-0">
        <CardHeader className="pb-4">
          <CardTitle>Review extraction</CardTitle>
          <CardDescription>
            Check each field against the documents alongside, then route for
            approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="invoice-validation-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-6"
          >
            <section className="grid min-w-0 grid-cols-1 gap-3">
              <div className="flex items-center justify-between gap-2">
                <SectionHeading>Supplier</SectionHeading>
                {canExtractSupplier ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={extracting || loading}
                    onClick={() => void handleFillWithAi()}
                  >
                    <Wand2Icon className="size-4" />
                    {extracting ? "Reading email…" : "Fill with AI"}
                  </Button>
                ) : null}
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-2">
                <Label
                  htmlFor="linked-supplier"
                  className="text-sm text-muted-foreground"
                >
                  Link to supplier
                </Label>
                <Select
                items={supplierSelectItems}
                value={createSupplier ? "create" : supplierId}
                onValueChange={(value) => {
                  setSupplierPickedByUser(true);
                  setSupplierRelinkNote(null);
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
                <p className="text-xs text-muted-foreground">
                  {supplierActionSummary}
                </p>
                {supplierRelinkNote ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                    <span>{supplierRelinkNote}</span>
                  </div>
                ) : null}
              </div>

              {extractError ? (
                <Alert variant="destructive">
                  <AlertDescription>{extractError}</AlertDescription>
                </Alert>
              ) : null}

              {extracting ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Reviewing the email thread for supplier matches…
                  </p>
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : null}

              {!extracting && pickerOpen && candidates.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {candidates.length > 1
                      ? "AI found more than one organisation in this email. Pick the one to bill against — it fills the fields below."
                      : "Review the suggested supplier — it fills the fields below."}
                  </p>
                  <div className="flex min-w-0 flex-col gap-2">
                    {candidates.map((candidate, index) => (
                      <SupplierCandidateCard
                        key={`${candidate.label}-${index}`}
                        candidate={candidate}
                        selected={selectedCandidateIndex === index}
                        onSelect={() => chooseCandidate(candidate, index)}
                        onModify={() => setPickerOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {!extracting && !pickerOpen && selectedCandidate ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                  <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
                    <SparklesIcon className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 truncate">
                      Filled from{" "}
                      <span className="font-medium text-foreground">
                        {selectedCandidate.company ?? selectedCandidate.label}
                      </span>
                    </span>
                  </p>
                  {candidates.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto shrink-0 px-1.5 py-0.5 text-xs"
                      onClick={() => setPickerOpen(true)}
                    >
                      Choose again ({candidates.length})
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {SUPPLIER_FIELDS.map((config) => (
                  <div key={config.key} className="grid gap-1.5">
                    <Label
                      htmlFor={config.key}
                      className="text-sm text-muted-foreground"
                    >
                      {config.label}
                    </Label>
                    <Input
                      id={config.key}
                      type={config.type}
                      value={fields[config.key]}
                      onChange={(event) => updateField(config.key, event.target.value)}
                      onBlur={
                        config.key === "vendorName"
                          ? realignSupplierToConfirmedName
                          : undefined
                      }
                      required={config.key === "vendorName"}
                    />
                  </div>
                ))}
              </div>

              {platformEmail ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-medium">{platformEmail} invoicing address.</span>{" "}
                    This isn&apos;t the supplier&apos;s own inbox — use their direct
                    email so future invoices match automatically.
                  </span>
                </div>
              ) : null}
            </section>

            <Separator />

            <section className="grid min-w-0 grid-cols-1 gap-3">
              <SectionHeading>Invoice details</SectionHeading>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {INVOICE_FIELDS.map((config) => (
                  <div key={config.key} className="grid gap-1.5">
                    <Label
                      htmlFor={config.key}
                      className="text-sm text-muted-foreground"
                    >
                      {config.label}
                    </Label>
                    <Input
                      id={config.key}
                      type={config.type}
                      step={config.type === "number" ? "0.01" : undefined}
                      value={fields[config.key]}
                      onChange={(event) => updateField(config.key, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </section>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </form>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button type="submit" form="invoice-validation-form" disabled={loading}>
            {loading ? "Confirming..." : "Confirm and route for approval"}
          </Button>
        </CardFooter>
      </Card>

      <div className="min-w-0 space-y-6">{sourceSlot}</div>
    </div>
  );
}
