"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  MessageSquareTextIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

type Supplier = {
  id: string;
  name: string;
  emailAddresses: string[];
  emailDomains: string[];
  tradingTermDays: number | null;
  extractionPrompt: string | null;
  invoiceCount: number;
  lastInvoiceAt: string | Date | null;
  noteCount: number;
};

type SupplierNote = {
  id: string;
  content: string;
  createdAt: string;
  authorName: string | null;
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

function formatInvoiceCount(count: number) {
  return `${count} invoice${count === 1 ? "" : "s"}`;
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
  const router = useRouter();
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
  const [deleteMode, setDeleteMode] = useState<"unlink" | "merge">("unlink");
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const [supplierNotes, setSupplierNotes] = useState<SupplierNote[] | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Invoice/note counts and merged email lists are computed server-side, so
  // every mutation re-renders the page and re-syncs local state from the fresh
  // props. Safe to clobber because mutations round-trip through the server
  // first; without it the list keeps stale counts and a later save would write
  // them back.
  const [prevInitialSuppliers, setPrevInitialSuppliers] = useState(initialSuppliers);
  if (prevInitialSuppliers !== initialSuppliers) {
    setPrevInitialSuppliers(initialSuppliers);
    setSuppliers(initialSuppliers);
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
    setSupplierNotes(null);
    setNotesError(null);
    setNoteDraft("");
    void loadNotes(supplier.id);
  }

  async function loadNotes(supplierId: string) {
    const response = await fetch(`/api/suppliers/${supplierId}/notes`);
    if (!response.ok) {
      setNotesError("Failed to load notes");
      return;
    }
    setSupplierNotes((await response.json()) as SupplierNote[]);
  }

  async function addNote() {
    if (!editingSupplier) return;
    const content = noteDraft.trim();
    if (!content) return;

    setAddingNote(true);
    setNotesError(null);

    const response = await fetch(`/api/suppliers/${editingSupplier.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    setAddingNote(false);

    if (!response.ok) {
      setNotesError("Failed to add note");
      return;
    }

    const note = (await response.json()) as SupplierNote;
    setSupplierNotes((current) => [note, ...(current ?? [])]);
    setNoteDraft("");
    setSuppliers((current) =>
      current.map((supplier) =>
        supplier.id === editingSupplier.id
          ? { ...supplier, noteCount: supplier.noteCount + 1 }
          : supplier,
      ),
    );
  }

  function closeEditor() {
    setEditingSupplier(null);
    setSaving(false);
    setOriginalPrompt("");
    closeDeleteDialog();
  }

  function openDeleteDialog() {
    setDeleteMode("unlink");
    setMergeTargetId(null);
    setMergeSearch("");
    setConfirmingDelete(true);
  }

  function closeDeleteDialog() {
    setConfirmingDelete(false);
    setDeleting(false);
  }

  async function deleteSupplier() {
    if (!editingSupplier) return;

    const mergeTarget =
      deleteMode === "merge"
        ? (suppliers.find((supplier) => supplier.id === mergeTargetId) ?? null)
        : null;
    if (deleteMode === "merge" && !mergeTarget) return;

    setDeleting(true);
    setError(null);

    const response = await fetch(
      `/api/suppliers/${editingSupplier.id}${mergeTarget ? `?mergeInto=${mergeTarget.id}` : ""}`,
      { method: "DELETE" },
    );

    setDeleting(false);

    if (!response.ok) {
      setConfirmingDelete(false);
      setError(
        mergeTarget
          ? `Failed to merge supplier into ${mergeTarget.name}`
          : "Failed to delete supplier",
      );
      return;
    }

    // Drop the deleted row immediately; the refresh brings back the survivor's
    // recalculated counts and merged email lists.
    setSuppliers((current) =>
      current.filter((supplier) => supplier.id !== editingSupplier.id),
    );
    closeEditor();
    router.refresh();
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

    const response = await fetch("/api/suppliers", {
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

    router.refresh();
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

    const response = await fetch(`/api/suppliers/${editingSupplier.id}`, {
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
              noteCount: supplier.noteCount,
            }
          : supplier,
      ),
    );
    closeEditor();
    router.refresh();
  }

  const isAnySheetOpen = createSheetOpen || Boolean(editingSupplier);

  // Busiest suppliers first — when picking which duplicate survives, the one
  // holding the most invoices is usually the keeper.
  const mergeCandidates = suppliers
    .filter(
      (supplier) =>
        supplier.id !== editingSupplier?.id &&
        supplier.name.toLowerCase().includes(mergeSearch.trim().toLowerCase()),
    )
    .sort((a, b) => b.invoiceCount - a.invoiceCount || a.name.localeCompare(b.name));

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
                <TableHead className="text-right">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
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
                    <TableCell className="text-right">
                      {supplier.noteCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <MessageSquareTextIcon className="size-3.5" />
                          <span className="tabular-nums">{supplier.noteCount}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
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

              <Separator />

              <div className="flex flex-col gap-3">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <MessageSquareTextIcon className="size-4" />
                  Notes
                </p>

                {notesError ? (
                  <p className="text-sm text-destructive">{notesError}</p>
                ) : null}

                <div className="flex flex-col gap-2">
                  <Textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="Add a note about this supplier"
                    disabled={addingNote}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void addNote()}
                      disabled={addingNote || !noteDraft.trim()}
                    >
                      {addingNote ? "Adding..." : "Add note"}
                    </Button>
                  </div>
                </div>

                {supplierNotes == null && !notesError ? (
                  <p className="text-sm text-muted-foreground">Loading notes...</p>
                ) : supplierNotes != null && supplierNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                ) : supplierNotes != null ? (
                  <div className="flex flex-col gap-3">
                    {supplierNotes.map((note) => (
                      <div
                        key={note.id}
                        className="space-y-1 border-b pb-3 last:border-0"
                      >
                        <p className="text-sm">
                          <span className="font-medium">
                            {note.authorName ?? "System"}
                          </span>
                          <span className="text-muted-foreground">
                            {" · "}
                            {formatDate(note.createdAt)}
                          </span>
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

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
                  onClick={openDeleteDialog}
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
        onOpenChange={(open) => !open && !deleting && closeDeleteDialog()}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete supplier</DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? `Choose what happens to the invoices, emails and notes linked to ${editingSupplier.name}.`
                : null}
            </DialogDescription>
          </DialogHeader>

          <div role="radiogroup" className="flex flex-col gap-2">
            {(
              [
                {
                  mode: "unlink" as const,
                  title: "Delete only",
                  description:
                    "Invoices and emails are kept but unlinked, and the extraction prompt is lost.",
                },
                {
                  mode: "merge" as const,
                  title: "Merge into another supplier",
                  description:
                    "Move everything onto the supplier you pick, then delete this duplicate.",
                },
              ]
            ).map((option) => (
              <button
                key={option.mode}
                type="button"
                role="radio"
                aria-checked={deleteMode === option.mode}
                onClick={() => setDeleteMode(option.mode)}
                disabled={deleting}
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent",
                  deleteMode === option.mode && "border-primary bg-accent",
                )}
              >
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="block text-sm text-muted-foreground">
                  {option.description}
                </span>
              </button>
            ))}
          </div>

          {deleteMode === "merge" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="merge-search">Merge into</Label>
              <Input
                id="merge-search"
                value={mergeSearch}
                onChange={(event) => setMergeSearch(event.target.value)}
                placeholder="Search suppliers"
                disabled={deleting}
              />
              <div className="max-h-56 overflow-y-auto rounded-md border">
                {mergeCandidates.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No other suppliers match.
                  </p>
                ) : (
                  mergeCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      role="radio"
                      aria-checked={mergeTargetId === candidate.id}
                      onClick={() => setMergeTargetId(candidate.id)}
                      disabled={deleting}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent",
                        mergeTargetId === candidate.id && "bg-accent",
                      )}
                    >
                      <span className="truncate text-sm font-medium">
                        {candidate.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatInvoiceCount(candidate.invoiceCount)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeDeleteDialog}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteSupplier()}
              disabled={deleting || (deleteMode === "merge" && !mergeTargetId)}
            >
              {deleteMode === "merge"
                ? deleting
                  ? "Merging..."
                  : "Merge and delete"
                : deleting
                  ? "Deleting..."
                  : "Delete supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
