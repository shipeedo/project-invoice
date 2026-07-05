"use client";

import { useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";
import type { ExtractedLineItem } from "@/lib/extraction";
import type { LineItemEditFields } from "@/lib/line-items";

type FieldKey = keyof LineItemEditFields;

const FIELD_KEYS: FieldKey[] = [
  "description",
  "serviceType",
  "reference",
  "quantity",
  "unitPrice",
  "amount",
];

const FIELD_DEFS: Record<FieldKey, { label: string; kind: "text" | "number" }> = {
  description: { label: "Description", kind: "text" },
  serviceType: { label: "Service", kind: "text" },
  reference: { label: "Reference", kind: "text" },
  quantity: { label: "Qty", kind: "number" },
  unitPrice: { label: "Unit price", kind: "number" },
  amount: { label: "Amount", kind: "number" },
};

type NumberFieldKey = "quantity" | "unitPrice" | "amount";

function rawFieldValue(item: ExtractedLineItem, key: FieldKey): string {
  const value = item[key];
  return value == null ? "" : String(value);
}

function initialFormState(items: ExtractedLineItem[]) {
  const values = {} as Record<FieldKey, string>;
  const mixed = {} as Record<FieldKey, boolean>;

  for (const key of FIELD_KEYS) {
    const first = items.length > 0 ? rawFieldValue(items[0], key) : "";
    const shared = items.every((item) => rawFieldValue(item, key) === first);
    values[key] = shared ? first : "";
    mixed[key] = !shared;
  }

  return { values, mixed };
}

const NO_FIELDS_ENABLED: Record<FieldKey, boolean> = {
  description: false,
  serviceType: false,
  reference: false,
  quantity: false,
  unitPrice: false,
  amount: false,
};

type LineItemEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selected line items, in table order. */
  items: ExtractedLineItem[];
  busy: boolean;
  onSave: (fields: LineItemEditFields) => void;
};

export function LineItemEditDialog({
  open,
  onOpenChange,
  items,
  busy,
  onSave,
}: LineItemEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? (
          <LineItemEditForm
            items={items}
            busy={busy}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type LineItemEditFormProps = {
  items: ExtractedLineItem[];
  busy: boolean;
  onSave: (fields: LineItemEditFields) => void;
  onCancel: () => void;
};

function LineItemEditForm({ items, busy, onSave, onCancel }: LineItemEditFormProps) {
  const isBulk = items.length > 1;
  const [initial] = useState(() => initialFormState(items));
  const [values, setValues] = useState(initial.values);
  const [enabled, setEnabled] = useState(NO_FIELDS_ENABLED);

  const result = useMemo(() => {
    const fields: LineItemEditFields = {};
    let invalid: string | null = null;
    let changes = 0;

    for (const key of FIELD_KEYS) {
      if (isBulk && !enabled[key]) continue;
      const raw = values[key].trim();
      if (!isBulk && raw === initial.values[key].trim()) continue;

      if (key === "description") {
        if (!raw) {
          invalid = "Description cannot be empty";
          continue;
        }
        fields.description = raw;
      } else if (FIELD_DEFS[key].kind === "number") {
        const numberKey = key as NumberFieldKey;
        if (!raw) {
          fields[numberKey] = null;
        } else {
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) {
            invalid = `${FIELD_DEFS[key].label} must be a number`;
            continue;
          }
          fields[numberKey] = parsed;
        }
      } else {
        fields[key as "serviceType" | "reference"] = raw || null;
      }

      changes += 1;
    }

    return { fields, invalid, hasChanges: changes > 0 };
  }, [values, enabled, isBulk, initial]);

  function setValue(key: FieldKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function toggleField(key: FieldKey, checked: boolean) {
    setEnabled((current) => ({ ...current, [key]: checked }));
  }

  function renderField(key: FieldKey) {
    const def = FIELD_DEFS[key];
    const active = !isBulk || enabled[key];
    const id = `line-edit-${key}`;
    const placeholder = isBulk && initial.mixed[key] ? "Mixed values" : undefined;

    const inputProps = {
      id,
      value: values[key],
      placeholder,
      disabled: !active || busy,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => setValue(key, event.target.value),
    };

    return (
      <div key={key} className="space-y-2">
        <div className="flex items-center gap-2">
          {isBulk ? (
            <Checkbox
              checked={enabled[key]}
              onCheckedChange={(checked) => toggleField(key, checked === true)}
              disabled={busy}
              aria-label={`Change ${def.label.toLowerCase()} on selected lines`}
            />
          ) : null}
          <Label
            htmlFor={id}
            className={cn(!active && "text-muted-foreground")}
          >
            {def.label}
          </Label>
        </div>
        {key === "description" ? (
          <Textarea {...inputProps} rows={2} className="min-h-9" />
        ) : (
          <Input
            {...inputProps}
            type={def.kind === "number" ? "number" : "text"}
            step={def.kind === "number" ? "any" : undefined}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isBulk ? `Edit ${items.length} lines` : "Edit line"}
        </DialogTitle>
        <DialogDescription>
          {isBulk
            ? "Tick the fields to change; they apply to every selected line. Leaving a ticked field empty clears it on all of them."
            : "Update this line's details. Clearing an optional field removes its value."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {renderField("description")}
        <div className="grid gap-4 sm:grid-cols-2">
          {renderField("serviceType")}
          {renderField("reference")}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {renderField("quantity")}
          {renderField("unitPrice")}
          {renderField("amount")}
        </div>
      </div>

      {result.invalid ? (
        <p className="text-sm text-destructive">{result.invalid}</p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => onSave(result.fields)}
          disabled={busy || !result.hasChanges || result.invalid !== null}
        >
          {busy
            ? "Saving..."
            : isBulk
              ? `Apply to ${items.length} lines`
              : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}
