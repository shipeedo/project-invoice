"use client";

import Link from "next/link";
import { ChevronDownIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete";
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
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
import { formatDate } from "@/lib/format";

type Supplier = {
  id: string;
  name: string;
  emailAddresses: string[];
  emailDomains: string[];
  tradingTermDays: number | null;
  extractionPrompt: string | null;
  invoiceCount: number;
  lastInvoiceAt: string | Date | null;
};

type SupplierSuggestion = {
  id: string;
  email: string;
  displayName: string | null;
  domain: string | null;
  messageCount: number;
  suggestedName: string;
};

type SuppliersManagerProps = {
  initialSuppliers: Supplier[];
  initialSuggestions?: SupplierSuggestion[];
};

function formatInboxMessageCount(count: number) {
  return `${count} message${count === 1 ? "" : "s"}`;
}

function parseTradingTerms(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const days = Number.parseInt(trimmed, 10);
  return Number.isFinite(days) && days > 0 ? days : null;
}

function CreateSupplierPanel({
  suggestions,
  createName,
  createEmails,
  createDomains,
  createTradingTerms,
  selectedSuggestion,
  creating,
  error,
  onNameChange,
  onEmailsChange,
  onDomainsChange,
  onTradingTermsChange,
  onSelectSuggestion,
  onSubmit,
  onCancel,
}: {
  suggestions: SupplierSuggestion[];
  createName: string;
  createEmails: string;
  createDomains: string;
  createTradingTerms: string;
  selectedSuggestion: SupplierSuggestion | null;
  creating: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onEmailsChange: (value: string) => void;
  onDomainsChange: (value: string) => void;
  onTradingTermsChange: (value: string) => void;
  onSelectSuggestion: (
    suggestion: SupplierSuggestion | null,
    source?: "name" | "email",
  ) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const hasSuggestions = suggestions.length > 0;

  function handleNameInputChange(value: string, details: { reason: string }) {
    onNameChange(value);
    if (
      details.reason === "input-change" &&
      selectedSuggestion &&
      value !== selectedSuggestion.suggestedName
    ) {
      onSelectSuggestion(null);
    }
  }

  function handleEmailInputChange(value: string, details: { reason: string }) {
    onEmailsChange(value);
    if (
      details.reason === "input-change" &&
      selectedSuggestion &&
      value !== selectedSuggestion.email
    ) {
      onSelectSuggestion(null);
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="create-name">Supplier name</Label>
          {hasSuggestions ? (
            <Autocomplete
              items={suggestions}
              itemToStringValue={(suggestion: SupplierSuggestion) => suggestion.suggestedName}
              value={createName}
              onValueChange={handleNameInputChange}
              openOnInputClick
            >
              <AutocompleteInput
                id="create-name"
                className="w-full"
                placeholder="Acme Transport"
              />
              <AutocompleteContent>
                <AutocompleteEmpty>No matching inbox senders.</AutocompleteEmpty>
                <AutocompleteList>
                  {(suggestion: SupplierSuggestion) => (
                    <AutocompleteItem
                      key={suggestion.id}
                      value={suggestion}
                      onClick={() => onSelectSuggestion(suggestion, "name")}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span>{suggestion.suggestedName}</span>
                        <span className="text-xs text-muted-foreground">
                          {suggestion.email} · {formatInboxMessageCount(suggestion.messageCount)}
                        </span>
                      </div>
                    </AutocompleteItem>
                  )}
                </AutocompleteList>
              </AutocompleteContent>
            </Autocomplete>
          ) : (
            <Input
              id="create-name"
              required
              placeholder="Acme Transport"
              value={createName}
              onChange={(event) => onNameChange(event.target.value)}
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="create-emails">Email addresses</Label>
          {hasSuggestions ? (
            <Autocomplete
              items={suggestions}
              itemToStringValue={(suggestion: SupplierSuggestion) => suggestion.email}
              value={createEmails}
              onValueChange={handleEmailInputChange}
              openOnInputClick
            >
              <AutocompleteInput
                id="create-emails"
                className="w-full"
                placeholder="billing@acme.com"
              />
              <AutocompleteContent>
                <AutocompleteEmpty>No matching inbox senders.</AutocompleteEmpty>
                <AutocompleteList>
                  {(suggestion: SupplierSuggestion) => (
                    <AutocompleteItem
                      key={suggestion.id}
                      value={suggestion}
                      onClick={() => onSelectSuggestion(suggestion, "email")}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span>{suggestion.email}</span>
                        <span className="text-xs text-muted-foreground">
                          {suggestion.suggestedName} · {formatInboxMessageCount(suggestion.messageCount)}
                        </span>
                      </div>
                    </AutocompleteItem>
                  )}
                </AutocompleteList>
              </AutocompleteContent>
            </Autocomplete>
          ) : (
            <Input
              id="create-emails"
              placeholder="billing@acme.com, accounts@acme.com"
              value={createEmails}
              onChange={(event) => onEmailsChange(event.target.value)}
            />
          )}
          <p className="text-sm text-muted-foreground">
            {hasSuggestions
              ? "Type an address or pick a sender from the inbox. Separate multiple addresses with commas."
              : "Separate multiple addresses with commas."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="create-domains">Email domains</Label>
          <Input
            id="create-domains"
            placeholder="acme.com"
            value={createDomains}
            onChange={(event) => onDomainsChange(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Used to match invoices from any address at this domain.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="create-trading-terms">Trading terms (days)</Label>
          <Input
            id="create-trading-terms"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="e.g. 7"
            value={createTradingTerms}
            onChange={(event) => onTradingTermsChange(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Optional. Days after the invoice date until it is due. When set, this
            overrides the due date stated on the invoice.
          </p>
        </div>
      </div>

      <Separator />

      <SheetFooter className="mt-auto flex-row justify-end gap-2 px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={onSubmit} disabled={creating || !createName.trim()}>
          {creating ? "Creating..." : "Create supplier"}
        </Button>
      </SheetFooter>
    </>
  );
}

export function SuppliersManager({
  initialSuppliers,
  initialSuggestions = [],
}: SuppliersManagerProps) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmails, setCreateEmails] = useState("");
  const [createDomains, setCreateDomains] = useState("");
  const [createTradingTerms, setCreateTradingTerms] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<SupplierSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmails, setEditEmails] = useState("");
  const [editDomains, setEditDomains] = useState("");
  const [editTradingTerms, setEditTradingTerms] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function refreshSuppliers() {
    const response = await fetch("/api/admin/suppliers");
    if (!response.ok) {
      setError("Failed to load suppliers");
      return;
    }
    setSuppliers(await response.json());
  }

  function openCreateSheet() {
    setCreateSheetOpen(true);
    setError(null);
  }

  function closeCreateSheet() {
    setCreateSheetOpen(false);
    setCreating(false);
    setCreateName("");
    setCreateEmails("");
    setCreateDomains("");
    setCreateTradingTerms("");
    setSelectedSuggestion(null);
  }

  function openEditor(supplier: Supplier) {
    setEditingSupplier(supplier);
    setEditName(supplier.name);
    setEditEmails(supplier.emailAddresses.join(", "));
    setEditDomains(supplier.emailDomains.join(", "));
    setEditTradingTerms(
      supplier.tradingTermDays != null ? String(supplier.tradingTermDays) : "",
    );
    const prompt = supplier.extractionPrompt ?? "";
    setEditPrompt(prompt);
    setOriginalPrompt(prompt);
    setError(null);
  }

  function closeEditor() {
    setEditingSupplier(null);
    setSaving(false);
    setOriginalPrompt("");
    setConfirmingDelete(false);
    setDeleting(false);
  }

  async function deleteSupplier() {
    if (!editingSupplier) return;

    setDeleting(true);
    setError(null);

    const response = await fetch(`/api/admin/suppliers/${editingSupplier.id}`, {
      method: "DELETE",
    });

    setDeleting(false);

    if (!response.ok) {
      setConfirmingDelete(false);
      setError("Failed to delete supplier");
      return;
    }

    setSuppliers((current) =>
      current.filter((supplier) => supplier.id !== editingSupplier.id),
    );
    closeEditor();
  }

  async function createSupplier() {
    const emailAddresses = createEmails
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const emailDomains = createDomains
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    setCreating(true);
    setError(null);

    const response = await fetch("/api/admin/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createName,
        emailAddresses,
        emailDomains,
        tradingTermDays: parseTradingTerms(createTradingTerms),
      }),
    });

    setCreating(false);

    if (!response.ok) {
      setError("Failed to create supplier");
      return;
    }

    await refreshSuppliers();
    if (selectedSuggestion) {
      setSuggestions((current) =>
        current.filter((entry) => entry.id !== selectedSuggestion.id),
      );
    }
    closeCreateSheet();
  }

  function selectSuggestion(
    suggestion: SupplierSuggestion | null,
    source?: "name" | "email",
  ) {
    if (!suggestion) {
      setSelectedSuggestion(null);
      return;
    }
    // Always fill the field the suggestion was picked from; only fill the
    // others when the user hasn't typed anything there yet.
    if (source === "name" || !createName.trim()) {
      setCreateName(suggestion.suggestedName);
    }
    if (source === "email" || !createEmails.trim()) {
      setCreateEmails(suggestion.email);
    }
    if (!createDomains.trim() && suggestion.domain) {
      setCreateDomains(suggestion.domain);
    }
    setSelectedSuggestion(suggestion);
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
        tradingTermDays: parseTradingTerms(editTradingTerms),
        ...(editPrompt !== originalPrompt ? { extractionPrompt: editPrompt } : {}),
      }),
    });

    setSaving(false);

    if (!response.ok) {
      setError("Failed to save supplier");
      return;
    }

    const updated = (await response.json()) as Supplier;
    setSuppliers((current) =>
      current.map((supplier) =>
        supplier.id === updated.id
          ? {
              ...updated,
              invoiceCount: supplier.invoiceCount,
              lastInvoiceAt: supplier.lastInvoiceAt,
            }
          : supplier,
      ),
    );
    closeEditor();
  }

  const isAnySheetOpen = createSheetOpen || Boolean(editingSupplier);

  return (
    <div className="space-y-6">
      {error && !isAnySheetOpen ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Suppliers ({suppliers.length})</CardTitle>
          <CardDescription>
            Invoice counts and last received dates are based on invoices linked to each supplier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Emails</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead>Last invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No suppliers yet. Create one to start linking inbox senders and invoices.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((supplier) => (
                  <TableRow
                    key={supplier.id}
                    className="cursor-pointer"
                    onClick={() => openEditor(supplier)}
                  >
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {supplier.emailAddresses.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {supplier.invoiceCount > 0 ? (
                        <Link
                          href={`/queue?supplier=${supplier.id}`}
                          className="font-medium text-primary hover:underline"
                          title={`View ${supplier.name} invoices`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {supplier.invoiceCount}
                        </Link>
                      ) : (
                        supplier.invoiceCount
                      )}
                    </TableCell>
                    <TableCell>{formatDate(supplier.lastInvoiceAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="border-t">
          <Button type="button" onClick={openCreateSheet}>
            <PlusIcon />
            Create supplier
          </Button>
        </CardFooter>
      </Card>

      <Sheet open={createSheetOpen} onOpenChange={(open) => !open && closeCreateSheet()}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-4xl">
          <SheetHeader className="px-6 py-5">
            <SheetTitle>Create supplier</SheetTitle>
            <SheetDescription>
              Add a supplier manually or start from a sender seen in the shared inbox.
            </SheetDescription>
          </SheetHeader>

          <Separator />

          <CreateSupplierPanel
            suggestions={suggestions}
            createName={createName}
            createEmails={createEmails}
            createDomains={createDomains}
            createTradingTerms={createTradingTerms}
            creating={creating}
            error={createSheetOpen ? error : null}
            selectedSuggestion={selectedSuggestion}
            onNameChange={setCreateName}
            onEmailsChange={setCreateEmails}
            onDomainsChange={setCreateDomains}
            onTradingTermsChange={setCreateTradingTerms}
            onSelectSuggestion={selectSuggestion}
            onSubmit={() => void createSupplier()}
            onCancel={closeCreateSheet}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(editingSupplier)} onOpenChange={(open) => !open && closeEditor()}>
        <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-4xl">
          <SheetHeader>
            <SheetTitle>Edit supplier</SheetTitle>
            <SheetDescription>
              Update contact details used to match inbox messages and invoices.
            </SheetDescription>
          </SheetHeader>

          {editingSupplier ? (
            <div className="mt-6 flex flex-col gap-6 px-4 pb-8">
              {error && editingSupplier ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-name">Supplier name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-emails">Email addresses</Label>
                <Input
                  id="edit-emails"
                  value={editEmails}
                  onChange={(event) => setEditEmails(event.target.value)}
                  placeholder="Comma-separated"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-domains">Email domains</Label>
                <Input
                  id="edit-domains"
                  value={editDomains}
                  onChange={(event) => setEditDomains(event.target.value)}
                  placeholder="Comma-separated"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-trading-terms">Trading terms (days)</Label>
                <Input
                  id="edit-trading-terms"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="e.g. 7"
                  value={editTradingTerms}
                  onChange={(event) => setEditTradingTerms(event.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Optional. Days after the invoice date until it is due. When set,
                  this overrides the due date stated on the invoice. Leave blank to
                  use the due date from the invoice.
                </p>
              </div>

              <Collapsible className="group/collapsible">
                <CollapsibleTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex w-full items-center justify-between px-0"
                    />
                  }
                >
                  Advanced
                  <ChevronDownIcon className="transition-transform group-data-open/collapsible:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-4 pt-4">
                  <p className="text-sm text-muted-foreground">
                    When you validate an invoice and choose the correct source for a field, this
                    supplier&apos;s extraction prompt is updated automatically for future invoices.
                    Only edit the system prompt below if you need a manual override.
                  </p>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="edit-prompt">Extraction system prompt</Label>
                    <Textarea
                      id="edit-prompt"
                      value={editPrompt}
                      onChange={(event) => setEditPrompt(event.target.value)}
                      className="min-h-64 font-mono text-xs"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="flex gap-2">
                <Button type="button" onClick={saveSupplier} disabled={saving || !editName.trim()}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
                <Button type="button" variant="outline" onClick={closeEditor}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="ml-auto"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={saving || deleting}
                >
                  <TrashIcon />
                  Delete supplier
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => !open && !deleting && setConfirmingDelete(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete supplier</DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? `This permanently deletes ${editingSupplier.name}. Invoices and emails already linked to this supplier are kept but unlinked, and its extraction prompt is lost.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteSupplier()}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
