"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  FIELD_LABELS,
  type SupplierFieldMappings,
  VALIDATABLE_FIELDS,
  type ValidatableField,
} from "@/lib/extraction-types";

type Supplier = {
  id: string;
  name: string;
  emailAddresses: string[];
  emailDomains: string[];
  extractionPrompt: string | null;
  fieldMappings: SupplierFieldMappings;
};

type SuppliersManagerProps = {
  initialSuppliers: Supplier[];
};

type MappingDraft = Partial<
  Record<
    ValidatableField,
    {
      preferredSource: string;
      label: string;
      preferredValue: string;
    }
  >
>;

function emptyMappingDraft(mappings: SupplierFieldMappings): MappingDraft {
  const draft: MappingDraft = {};
  for (const field of VALIDATABLE_FIELDS) {
    const mapping = mappings[field];
    if (!mapping?.preferredSource) continue;
    draft[field] = {
      preferredSource: mapping.preferredSource,
      label: mapping.label ?? "",
      preferredValue: mapping.preferredValue ?? "",
    };
  }
  return draft;
}

function mappingDraftToPayload(draft: MappingDraft): SupplierFieldMappings {
  const mappings: SupplierFieldMappings = {};
  for (const field of VALIDATABLE_FIELDS) {
    const entry = draft[field];
    if (!entry?.preferredSource.trim()) continue;
    mappings[field] = {
      preferredSource: entry.preferredSource.trim(),
      label: entry.label.trim() || undefined,
      preferredValue: entry.preferredValue.trim() || undefined,
    };
  }
  return mappings;
}

export function SuppliersManager({ initialSuppliers }: SuppliersManagerProps) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [error, setError] = useState<string | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmails, setEditEmails] = useState("");
  const [editDomains, setEditDomains] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editMappings, setEditMappings] = useState<MappingDraft>({});
  const [saving, setSaving] = useState(false);

  async function refreshSuppliers() {
    const response = await fetch("/api/admin/suppliers");
    if (!response.ok) {
      setError("Failed to load suppliers");
      return;
    }
    setSuppliers(await response.json());
  }

  function openEditor(supplier: Supplier) {
    setEditingSupplier(supplier);
    setEditName(supplier.name);
    setEditEmails(supplier.emailAddresses.join(", "));
    setEditDomains(supplier.emailDomains.join(", "));
    setEditPrompt(supplier.extractionPrompt ?? "");
    setEditMappings(emptyMappingDraft(supplier.fieldMappings));
    setError(null);
  }

  function closeEditor() {
    setEditingSupplier(null);
    setSaving(false);
  }

  function updateMappingField(
    field: ValidatableField,
    key: "preferredSource" | "label" | "preferredValue",
    value: string,
  ) {
    setEditMappings((current) => ({
      ...current,
      [field]: {
        preferredSource: current[field]?.preferredSource ?? "",
        label: current[field]?.label ?? "",
        preferredValue: current[field]?.preferredValue ?? "",
        [key]: value,
      },
    }));
  }

  async function createSupplier(formData: FormData) {
    const emailAddresses = String(formData.get("emailAddresses") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const emailDomains = String(formData.get("emailDomains") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const response = await fetch("/api/admin/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name")),
        emailAddresses,
        emailDomains,
      }),
    });

    if (!response.ok) {
      setError("Failed to create supplier");
      return;
    }

    await refreshSuppliers();
  }

  async function saveSupplier() {
    if (!editingSupplier) return;

    setSaving(true);
    setError(null);

    const emailAddresses = editEmails
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const emailDomains = editDomains
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const response = await fetch(`/api/admin/suppliers/${editingSupplier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        emailAddresses,
        emailDomains,
        extractionPrompt: editPrompt,
        fieldMappings: mappingDraftToPayload(editMappings),
      }),
    });

    setSaving(false);

    if (!response.ok) {
      setError("Failed to save supplier");
      return;
    }

    const updated = (await response.json()) as Supplier;
    setSuppliers((current) =>
      current.map((supplier) => (supplier.id === updated.id ? updated : supplier)),
    );
    closeEditor();
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Suppliers ({suppliers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Emails</TableHead>
                <TableHead>Domains</TableHead>
                <TableHead>Mappings</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No suppliers yet.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>{supplier.emailAddresses.join(", ") || "—"}</TableCell>
                    <TableCell>{supplier.emailDomains.join(", ") || "—"}</TableCell>
                    <TableCell>
                      {Object.keys(supplier.fieldMappings).length > 0
                        ? `${Object.keys(supplier.fieldMappings).length} field(s)`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEditor(supplier)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add supplier</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              await createSupplier(formData);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="name">Supplier name</Label>
              <Input id="name" name="name" required placeholder="Supplier name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailAddresses">Email addresses</Label>
              <Input
                id="emailAddresses"
                name="emailAddresses"
                placeholder="Comma-separated"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailDomains">Email domains</Label>
              <Input id="emailDomains" name="emailDomains" placeholder="Comma-separated" />
            </div>
            <Button type="submit">Create supplier</Button>
          </form>
        </CardContent>
      </Card>

      <Sheet open={Boolean(editingSupplier)} onOpenChange={(open) => !open && closeEditor()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Edit supplier</SheetTitle>
            <SheetDescription>
              Update contact details, the extraction system prompt, and field mappings for this
              supplier. Mapping changes are written into the system prompt automatically.
            </SheetDescription>
          </SheetHeader>

          {editingSupplier ? (
            <div className="mt-6 space-y-6 px-4 pb-8">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Supplier name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-emails">Email addresses</Label>
                <Input
                  id="edit-emails"
                  value={editEmails}
                  onChange={(event) => setEditEmails(event.target.value)}
                  placeholder="Comma-separated"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-domains">Email domains</Label>
                <Input
                  id="edit-domains"
                  value={editDomains}
                  onChange={(event) => setEditDomains(event.target.value)}
                  placeholder="Comma-separated"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-prompt">Extraction system prompt</Label>
                <Textarea
                  id="edit-prompt"
                  value={editPrompt}
                  onChange={(event) => setEditPrompt(event.target.value)}
                  className="min-h-64 font-mono text-xs"
                />
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Field mappings</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tell the extractor which document source to prefer for each header field.
                    Saving updates the mappings section in the system prompt.
                  </p>
                </div>

                {VALIDATABLE_FIELDS.map((field) => (
                  <div key={field} className="space-y-3 rounded-lg border p-4">
                    <p className="text-sm font-medium">{FIELD_LABELS[field]}</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor={`${field}-source`}>Preferred source</Label>
                        <Input
                          id={`${field}-source`}
                          value={editMappings[field]?.preferredSource ?? ""}
                          onChange={(event) =>
                            updateMappingField(field, "preferredSource", event.target.value)
                          }
                          placeholder="issuer, header, summary..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${field}-label`}>Label</Label>
                        <Input
                          id={`${field}-label`}
                          value={editMappings[field]?.label ?? ""}
                          onChange={(event) =>
                            updateMappingField(field, "label", event.target.value)
                          }
                          placeholder='e.g. "Issuer: Acme Transport"'
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${field}-value`}>Example value</Label>
                        <Input
                          id={`${field}-value`}
                          value={editMappings[field]?.preferredValue ?? ""}
                          onChange={(event) =>
                            updateMappingField(field, "preferredValue", event.target.value)
                          }
                          placeholder="Optional example"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button type="button" onClick={saveSupplier} disabled={saving || !editName.trim()}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
                <Button type="button" variant="outline" onClick={closeEditor}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
