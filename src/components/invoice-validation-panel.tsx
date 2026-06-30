"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExtractedLineItem } from "@/lib/extraction";
import type { ExtractionCandidates, FieldCandidate, ValidatableField } from "@/lib/extraction-types";

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
    totalAmount: string;
    currency: string;
  };
  lineItems: ExtractedLineItem[];
  supplierId: string | null;
  supplierName: string | null;
  suppliers: SupplierOption[];
};

type FieldConfig = {
  key: ValidatableField;
  label: string;
  type: "text" | "date" | "number";
};

const FIELD_CONFIG: FieldConfig[] = [
  { key: "vendorName", label: "Supplier name", type: "text" },
  { key: "vendorEmail", label: "Supplier email", type: "text" },
  { key: "invoiceNumber", label: "Invoice number", type: "text" },
  { key: "invoiceDate", label: "Invoice date", type: "date" },
  { key: "dueDate", label: "Due date", type: "date" },
  { key: "totalAmount", label: "Total amount", type: "number" },
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
        label: `Current: ${currentValue}`,
        source: "selected",
      });
    }
  }

  return merged;
}

function formatCandidateLabel(candidate: FieldCandidate) {
  return `${candidate.label} (${candidate.source.replaceAll("_", " ")})`;
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
}: InvoiceValidationPanelProps) {
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  const [selectedSources, setSelectedSources] = useState<
    Partial<Record<ValidatableField, string>>
  >({});
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "none");
  const [createSupplier, setCreateSupplier] = useState(!initialSupplierId);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canValidate = ["PENDING_VALIDATION", "NEEDS_REVIEW"].includes(status);

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

  if (!canValidate) {
    return null;
  }

  function updateField(key: ValidatableField, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function applyCandidate(field: ValidatableField, candidate: FieldCandidate) {
    updateField(field, candidate.value);
    setSelectedSources((current) => ({ ...current, [field]: candidate.source }));
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
        totalAmount: fields.totalAmount ? Number(fields.totalAmount) : null,
        currency: fields.currency || "AUD",
      },
      lineItems,
      selectedSources,
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
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>Validate extraction</CardTitle>
        <CardDescription>
          Review AI-extracted fields, pick the correct match when multiple options
          exist, and confirm before routing for approval. Your choices teach the
          system for future invoices from this supplier.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Linked supplier</Label>
            <Select
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
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create">
                  Create supplier from confirmed name
                </SelectItem>
                {supplierName && initialSupplierId ? (
                  <SelectItem value={initialSupplierId}>
                    Matched: {supplierName}
                  </SelectItem>
                ) : null}
                {suppliers
                  .filter((supplier) => supplier.id !== initialSupplierId)
                  .map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {FIELD_CONFIG.map((config) => {
            const options = fieldOptions[config.key];
            const hasAlternatives = options.length > 1;

            return (
              <div key={config.key} className="space-y-2 rounded-lg border p-4">
                <Label htmlFor={config.key}>{config.label}</Label>
                <Input
                  id={config.key}
                  type={config.type}
                  value={fields[config.key]}
                  onChange={(event) => updateField(config.key, event.target.value)}
                  required={config.key === "vendorName"}
                />

                {hasAlternatives ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Possible matches from the PDF:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {options.map((candidate) => {
                        const isSelected =
                          fields[config.key] === candidate.value &&
                          selectedSources[config.key] === candidate.source;

                        return (
                          <Button
                            key={`${candidate.source}-${candidate.value}`}
                            type="button"
                            size="sm"
                            variant={isSelected ? "default" : "outline"}
                            onClick={() => applyCandidate(config.key, candidate)}
                          >
                            {formatCandidateLabel(candidate)}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ) : options.length === 1 ? (
                  <p className="text-xs text-muted-foreground">
                    Match: {formatCandidateLabel(options[0])}
                  </p>
                ) : null}
              </div>
            );
          })}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={loading}>
            {loading ? "Confirming..." : "Confirm extraction & route for approval"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
