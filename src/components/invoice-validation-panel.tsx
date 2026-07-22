"use client";

import {
  BuildingIcon,
  CheckIcon,
  PlusIcon,
  SparklesIcon,
  TriangleAlertIcon,
  Wand2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  rankSupplierMatches,
  sharedEmailProvider,
  type SupplierMatch,
  type SupplierMatchReason,
  type SupplierMatchTarget,
} from "@/lib/supplier-matching";
import { cn } from "@/lib/utils";

type SupplierOption = SupplierMatchTarget;

type LinkedSupplier = {
  id: string;
  name: string;
};

/** Sentinel selection for "none of these — create a new supplier". */
const CREATE = "create";

const MATCH_REASON_LABEL: Record<SupplierMatchReason, string> = {
  email: "Email match",
  domain: "Domain match",
  name: "Name match",
  similar_name: "Similar name",
};

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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function StepBadge({ step }: { step: 1 | 2 }) {
  return (
    <Badge variant="secondary" className="shrink-0">
      Step {step} of 2
    </Badge>
  );
}

type SupplierChoiceProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: React.ReactNode;
  selected: boolean;
  tone?: "match" | "create";
  onSelect: () => void;
};

function SupplierChoice({
  icon,
  title,
  description,
  badge,
  selected,
  tone = "match",
  onSelect,
}: SupplierChoiceProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-primary/40 bg-primary/5 ring-2 ring-primary"
          : "hover:border-muted-foreground/20 hover:bg-muted/30",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 bg-background text-transparent",
        )}
        aria-hidden
      >
        <CheckIcon className="size-3" />
      </span>
      <span
        className={cn(
          "mt-0.5 shrink-0",
          tone === "create" ? "text-primary" : "text-muted-foreground",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-tight wrap-break-word">{title}</span>
        <span className="text-xs leading-snug text-muted-foreground wrap-break-word">
          {description}
        </span>
      </span>
      {badge ? <span className="shrink-0">{badge}</span> : null}
    </button>
  );
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
  const [linkedSupplier, setLinkedSupplier] = useState<LinkedSupplier | null>(
    initialSupplierId && supplierName
      ? { id: initialSupplierId, name: supplierName }
      : null,
  );
  // The supplier is settled first: an invoice that arrived with a link already
  // resolved skips straight to its details. A blank supplier name does not
  // count as settled even when a link exists — validation rejects it, and only
  // step one can edit it.
  const [step, setStep] = useState<"supplier" | "details">(
    initialSupplierId && supplierName && initialFields.vendorName.trim()
      ? "details"
      : "supplier",
  );
  // Null until the reviewer overrides the ranked default.
  const [picked, setPicked] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [candidates, setCandidates] = useState<SupplierCandidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(
    null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const canValidate = status === "DRAFT";

  // Re-ranked as the reviewer edits, so the offered matches always reflect the
  // name and email actually being confirmed.
  const matches = useMemo(
    () =>
      rankSupplierMatches(suppliers, {
        name: fields.vendorName,
        email: fields.vendorEmail,
      }),
    [suppliers, fields.vendorName, fields.vendorEmail],
  );

  // Matching always leads; creating is only the default once nothing matches.
  const defaultSelection = useMemo(() => {
    if (linkedSupplier && matches.some((match) => match.supplierId === linkedSupplier.id)) {
      return linkedSupplier.id;
    }
    return matches[0]?.supplierId ?? CREATE;
  }, [matches, linkedSupplier]);

  const selection = picked ?? defaultSelection;
  const selectedMatch = matches.find((match) => match.supplierId === selection) ?? null;
  const otherSupplier =
    selection !== CREATE && !selectedMatch
      ? (suppliers.find((supplier) => supplier.id === selection) ?? null)
      : null;

  if (!canValidate) {
    return null;
  }

  function updateField(key: ValidationFieldKey, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  /** Fill the supplier fields from a candidate and collapse the picker so the
   * form fields are the single source of truth for what gets matched. */
  function chooseCandidate(candidate: SupplierCandidate, index: number) {
    setSelectedCandidateIndex(index);
    setPickerOpen(false);
    setPicked(null);
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

  async function handleLinkSupplier(event: React.FormEvent) {
    event.preventDefault();

    setLinking(true);
    setLinkError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/link-supplier`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorName: fields.vendorName,
        vendorEmail: fields.vendorEmail || null,
        ...(selection === CREATE
          ? { createSupplier: true }
          : { supplierId: selection }),
      }),
    });

    setLinking(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setLinkError(body.error ?? "Failed to link supplier");
      return;
    }

    const body = (await response.json()) as { supplier: LinkedSupplier };
    setLinkedSupplier(body.supplier);
    setPicked(null);
    setStep("details");
    router.refresh();
  }

  function numberOrNull(value: string) {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!linkedSupplier) {
      setError("Link a supplier before routing for approval.");
      setStep("supplier");
      return;
    }

    setLoading(true);
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
        // The link the reviewer settled in step one, never re-derived from the
        // fields: a match confirmed on a near name would otherwise be dropped.
        supplierId: linkedSupplier.id,
      }),
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
  const platformEmail = sharedEmailProvider(fields.vendorEmail);
  const confirmedName = fields.vendorName.trim();

  const supplierCard =
    step === "supplier" ? (
      <Card className="min-w-0">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Confirm the supplier</CardTitle>
              <CardDescription>
                Match this invoice to a supplier — or create one — before it goes for
                approval.
              </CardDescription>
            </div>
            <StepBadge step={1} />
          </div>
        </CardHeader>
        <CardContent>
          <form
            id="invoice-supplier-form"
            onSubmit={handleLinkSupplier}
            className="flex flex-col gap-5"
          >
            <section className="grid min-w-0 grid-cols-1 gap-3">
              <div className="flex items-center justify-between gap-2">
                <SectionHeading>Supplier on the invoice</SectionHeading>
                {canExtractSupplier ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={extracting || linking}
                    onClick={() => void handleFillWithAi()}
                  >
                    <Wand2Icon className="size-4" />
                    {extracting ? "Reading email…" : "Fill with AI"}
                  </Button>
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
                <div className="grid gap-1.5">
                  <Label htmlFor="vendorName" className="text-sm text-muted-foreground">
                    Supplier name
                  </Label>
                  <Input
                    id="vendorName"
                    value={fields.vendorName}
                    onChange={(event) => updateField("vendorName", event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="vendorEmail" className="text-sm text-muted-foreground">
                    Supplier email
                  </Label>
                  <Input
                    id="vendorEmail"
                    value={fields.vendorEmail}
                    onChange={(event) => updateField("vendorEmail", event.target.value)}
                  />
                </div>
              </div>

              {platformEmail ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-medium">{platformEmail} address.</span> This
                    isn&apos;t the supplier&apos;s own domain, so it won&apos;t be
                    recorded against them — use their direct email if you have it, so
                    future invoices match automatically.
                  </span>
                </div>
              ) : null}
            </section>

            <Separator />

            <section className="grid min-w-0 grid-cols-1 gap-3">
              <SectionHeading>
                {matches.length > 0 ? "Matching suppliers" : "No matching supplier"}
              </SectionHeading>

              {matches.length > 0 ? (
                <div className="flex min-w-0 flex-col gap-2">
                  {matches.map((match: SupplierMatch) => (
                    <SupplierChoice
                      key={match.supplierId}
                      icon={<BuildingIcon className="size-4" />}
                      title={match.name}
                      description={match.detail}
                      badge={
                        <Badge
                          variant={
                            match.confidence === "high"
                              ? "default"
                              : match.confidence === "medium"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {MATCH_REASON_LABEL[match.reason]}
                        </Badge>
                      }
                      selected={selection === match.supplierId}
                      onSelect={() => setPicked(match.supplierId)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing on file matches{" "}
                  <span className="font-medium text-foreground">
                    {confirmedName || "this supplier"}
                  </span>
                  {fields.vendorEmail ? ` or ${fields.vendorEmail}` : ""}. Create it, or
                  pick an existing supplier below.
                </p>
              )}

              <SupplierChoice
                tone="create"
                icon={<PlusIcon className="size-4" />}
                title={
                  confirmedName
                    ? `Create “${confirmedName}”`
                    : "Create a new supplier"
                }
                description="Adds a new supplier from the confirmed name and email"
                selected={selection === CREATE}
                onSelect={() => setPicked(CREATE)}
              />

              <div className="grid min-w-0 gap-1.5">
                <Label
                  htmlFor="other-supplier"
                  className="text-sm text-muted-foreground"
                >
                  Or link to another supplier
                </Label>
                <Select
                  items={suppliers.map((supplier) => ({
                    label: supplier.name,
                    value: supplier.id,
                  }))}
                  value={otherSupplier?.id ?? null}
                  onValueChange={(value) => {
                    if (value) setPicked(value);
                  }}
                >
                  <SelectTrigger id="other-supplier" className="h-10 w-full">
                    <SelectValue>
                      {otherSupplier?.name ?? (
                        <span className="text-muted-foreground">
                          Search all suppliers
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    alignItemWithTrigger={false}
                    className="min-w-[var(--anchor-width)]"
                  >
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {linkError ? (
              <Alert variant="destructive">
                <AlertDescription>{linkError}</AlertDescription>
              </Alert>
            ) : null}
          </form>
        </CardContent>
        <CardFooter className="justify-between gap-3 border-t">
          <p className="min-w-0 text-xs text-muted-foreground">
            {selection === CREATE
              ? `A new supplier will be created and linked${
                  confirmedName ? ` as “${confirmedName}”` : ""
                }.`
              : `This invoice will be linked to ${
                  selectedMatch?.name ?? otherSupplier?.name ?? "the selected supplier"
                }.`}
          </p>
          <Button
            type="submit"
            form="invoice-supplier-form"
            disabled={linking || !confirmedName}
          >
            {linking
              ? "Linking…"
              : selection === CREATE
                ? "Create supplier and continue"
                : "Link supplier and continue"}
          </Button>
        </CardFooter>
      </Card>
    ) : (
      <Card className="min-w-0">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Review invoice details</CardTitle>
              <CardDescription>
                Check each field against the documents alongside, then route for
                approval.
              </CardDescription>
            </div>
            <StepBadge step={2} />
          </div>
        </CardHeader>
        <CardContent>
          <form
            id="invoice-validation-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-6"
          >
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
              <p className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                <CheckIcon className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 truncate">
                  Supplier{" "}
                  <span className="font-medium">{linkedSupplier?.name ?? "—"}</span>
                </span>
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto shrink-0 px-1.5 py-0.5 text-xs"
                onClick={() => setStep("supplier")}
              >
                Change supplier
              </Button>
            </div>

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
    );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] xl:items-start">
      {supplierCard}
      <div className="min-w-0 space-y-6">{sourceSlot}</div>
    </div>
  );
}
