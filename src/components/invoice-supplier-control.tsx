"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type SupplierChoice = {
  id: string;
  name: string;
};

type InvoiceSupplierControlProps = {
  invoiceId: string;
  supplier: SupplierChoice | null;
  suppliers: SupplierChoice[];
  canChange: boolean;
};

/**
 * Shows which supplier an invoice is linked to, and lets it be re-pointed when
 * the match was wrong — including after approval, since a mislinked invoice is
 * usually only noticed once it turns up under the wrong supplier.
 */
export function InvoiceSupplierControl({
  invoiceId,
  supplier,
  suppliers,
  canChange,
}: InvoiceSupplierControlProps) {
  const router = useRouter();
  const anchor = useComboboxAnchor();
  const [open, setOpen] = useState(false);
  // What the API last confirmed, so the line and the Save baseline are right
  // straight away rather than after router.refresh() lands. Re-seeded from the
  // server whenever the invoice's own supplier changes.
  const [linked, setLinked] = useState(supplier);
  const [picked, setPicked] = useState<SupplierChoice | null>(supplier);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adjusting during render rather than in an effect, so a server-side change
  // is reflected in the same pass instead of a second one.
  const [serverSupplierId, setServerSupplierId] = useState(supplier?.id ?? null);
  if ((supplier?.id ?? null) !== serverSupplierId) {
    setServerSupplierId(supplier?.id ?? null);
    setLinked(supplier);
  }

  function openDialog() {
    setPicked(linked);
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (!picked || picked.id === linked?.id) {
      setOpen(false);
      return;
    }

    setSaving(true);
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/supplier`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: picked.id }),
    });

    setSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Could not change the supplier");
      return;
    }

    const body = (await response.json()) as { supplier: SupplierChoice };
    setLinked(body.supplier);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <span>Supplier: {linked?.name ?? "Not linked"}</span>
      {canChange ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-sm"
          onClick={openDialog}
        >
          {linked ? "Change" : "Link supplier"}
        </Button>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => !nextOpen && !saving && setOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {linked ? "Change supplier" : "Link a supplier"}
            </DialogTitle>
            <DialogDescription>
              Moves this invoice onto another supplier. The extracted supplier
              name and email stay as they are; the due date is re-derived from
              the new supplier&apos;s trading terms.
            </DialogDescription>
          </DialogHeader>

          <Combobox
            items={suppliers}
            value={picked}
            onValueChange={(next: SupplierChoice | null) => setPicked(next)}
            itemToStringLabel={(item: SupplierChoice) => item.name}
            itemToStringValue={(item: SupplierChoice) => item.id}
            isItemEqualToValue={(item: SupplierChoice, value: SupplierChoice) =>
              item.id === value.id
            }
          >
            <div ref={anchor} className="w-full">
              <ComboboxInput
                className="w-full"
                placeholder="Search suppliers…"
                showClear={Boolean(picked)}
              />
            </div>
            <ComboboxContent anchor={anchor}>
              <ComboboxEmpty>No matching suppliers.</ComboboxEmpty>
              <ComboboxList>
                {(item: SupplierChoice) => (
                  <ComboboxItem key={item.id} value={item}>
                    {item.name}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving || !picked || picked.id === linked?.id}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
