"use client";

import { PlusIcon, Wand2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  /** Inline document previews rendered beside the fields being confirmed. */
  sourceSlot?: React.ReactNode;
};

type FieldConfig = {
  key: ValidationFieldKey;
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
  { key: "subtotalAmount", label: "Subtotal", type: "number" },
  { key: "taxAmount", label: "GST", type: "number" },
  { key: "totalAmount", label: "Total", type: "number" },
  { key: "currency", label: "Currency", type: "text" },
];

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
  sourceSlot,
}: InvoiceValidationPanelProps) {
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "none");
  const [createSupplier, setCreateSupplier] = useState(!initialSupplierId);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    setFields((current) => ({ ...current, [key]: value }));
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] xl:items-start">
      <Card>
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
            className="flex flex-col gap-4"
          >
            <div className="grid gap-2">
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

            <div className="grid gap-4 sm:grid-cols-2">
              {FIELD_CONFIG.map((config) => (
                <div key={config.key} className="grid gap-1.5">
                  <Label htmlFor={config.key} className="text-sm text-muted-foreground">
                    {config.label}
                  </Label>
                  <Input
                    id={config.key}
                    type={config.type}
                    step={config.type === "number" ? "0.01" : undefined}
                    value={fields[config.key]}
                    onChange={(event) => updateField(config.key, event.target.value)}
                    required={config.key === "vendorName"}
                  />
                </div>
              ))}
            </div>

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
