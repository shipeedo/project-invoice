"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LineItemEditDialog } from "@/components/line-item-edit-dialog";
import {
  LineItemsActionBar,
  type LineItemAction,
} from "@/components/line-items-action-bar";
import type { ExtractedLineItem, LineItemStatus } from "@/lib/extraction";
import {
  applyLineEditUpdates,
  resolveLineAssigneeId,
  resolveLineItemStatus,
  type LineItemEditFields,
} from "@/lib/line-items";
import { formatCurrency, statusLabel } from "@/lib/format";

type UserOption = {
  id: string;
  name: string | null;
  email: string;
};

type InvoiceLineItemsTableProps = {
  invoiceId: string;
  lineItems: ExtractedLineItem[];
  users: UserOption[];
  invoiceAssignedToId: string | null;
  invoiceAssignedToLabel: string | null;
  currency: string;
  actionsEnabled: boolean;
  decisionsEnabled?: boolean;
};

function userLabel(user: UserOption) {
  return user.name ?? user.email;
}

const lineStatusVariants: Record<
  LineItemStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
};

function LineStatusBadge({ status }: { status: LineItemStatus }) {
  return <Badge variant={lineStatusVariants[status]}>{statusLabel(status)}</Badge>;
}

export function InvoiceLineItemsTable({
  invoiceId,
  lineItems: initialLineItems,
  users,
  invoiceAssignedToId,
  invoiceAssignedToLabel,
  currency,
  actionsEnabled,
  decisionsEnabled = false,
}: InvoiceLineItemsTableProps) {
  const router = useRouter();
  const [lineItems, setLineItems] = useState(initialLineItems);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<LineItemAction | null>(null);

  const usersById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const assignSelectItems = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];

    if (invoiceAssignedToId && invoiceAssignedToLabel) {
      items.push({
        value: invoiceAssignedToId,
        label: `${invoiceAssignedToLabel} (invoice)`,
      });
    } else {
      items.push({ value: "__invoice__", label: "Invoice assignee" });
    }

    for (const user of users) {
      if (user.id === invoiceAssignedToId) continue;
      items.push({ value: user.id, label: userLabel(user) });
    }

    return items;
  }, [users, invoiceAssignedToId, invoiceAssignedToLabel]);

  const selectedIndexes = useMemo(
    () => [...selected].sort((a, b) => a - b),
    [selected],
  );
  const selectedItems = useMemo(
    () => selectedIndexes.map((index) => lineItems[index]).filter(Boolean),
    [selectedIndexes, lineItems],
  );

  const allSelected = lineItems.length > 0 && selected.size === lineItems.length;
  const someSelected = selected.size > 0 && !allSelected;

  // Approving lines that are already approved is a no-op; same for rejecting
  // rejected lines. Disable the matching decision button in that case.
  const allSelectedApproved =
    selectedItems.length > 0 &&
    selectedItems.every((item) => resolveLineItemStatus(item) === "APPROVED");
  const allSelectedRejected =
    selectedItems.length > 0 &&
    selectedItems.every((item) => resolveLineItemStatus(item) === "REJECTED");

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(lineItems.map((_, index) => index)));
    } else {
      setSelected(new Set());
    }
  }

  function toggleLine(index: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(index);
      } else {
        next.delete(index);
      }
      return next;
    });
  }

  function displayAssignee(item: ExtractedLineItem) {
    const assigneeId = resolveLineAssigneeId(item, invoiceAssignedToId);
    if (!assigneeId) return "Unassigned";
    const user = usersById.get(assigneeId);
    return user ? userLabel(user) : "Unknown user";
  }

  function clearLineAssignee(item: ExtractedLineItem): ExtractedLineItem {
    const next = { ...item };
    delete next.assignedToId;
    return next;
  }

  async function assignSelected() {
    if (selected.size === 0 || !assigneeId) return;

    const useInvoiceAssignee =
      assigneeId === invoiceAssignedToId || assigneeId === "__invoice__";

    const nextLineItems = lineItems.map((item, index) => {
      if (!selected.has(index)) return item;
      if (useInvoiceAssignee) return clearLineAssignee(item);
      return { ...item, assignedToId: assigneeId };
    });

    const assignments = [...selected].map((lineIndex) => ({
      lineIndex,
      assignedToId: useInvoiceAssignee ? null : assigneeId,
    }));

    setBusyAction("assign");
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/line-assignments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    });

    setBusyAction(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Failed to save assignments");
      return;
    }

    setLineItems(nextLineItems);
    setSelected(new Set());
    setAssigneeId("");
    setAssignDialogOpen(false);
    router.refresh();
  }

  async function editSelected(fields: LineItemEditFields) {
    if (selected.size === 0) return;

    const edits = selectedIndexes.map((lineIndex) => ({ lineIndex, fields }));

    setBusyAction("edit");
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/line-edits`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits }),
    });

    setBusyAction(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Failed to save line edits");
      return;
    }

    setLineItems(applyLineEditUpdates(lineItems, edits));
    setSelected(new Set());
    setEditDialogOpen(false);
    router.refresh();
  }

  async function decideSelected(status: "APPROVED" | "REJECTED") {
    if (selected.size === 0 || !decisionsEnabled) return;

    const action = status === "APPROVED" ? "approve" : "reject";
    const decisions = [...selected].map((lineIndex) => ({ lineIndex, status }));

    const nextLineItems = lineItems.map((item, index) =>
      selected.has(index) ? { ...item, status } : item,
    );

    setBusyAction(action);
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/line-decisions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions }),
    });

    setBusyAction(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? `Failed to ${action} selected lines`);
      return;
    }

    setLineItems(nextLineItems);
    setSelected(new Set());
    router.refresh();
  }

  function handleAction(action: LineItemAction) {
    if (selected.size === 0) return;

    switch (action) {
      case "assign":
        setAssignDialogOpen(true);
        break;
      case "edit":
        setEditDialogOpen(true);
        break;
      case "approve":
        void decideSelected("APPROVED");
        break;
      case "reject":
        void decideSelected("REJECTED");
        break;
      case "credit":
        break;
    }
  }

  if (lineItems.length === 0) {
    return <p className="text-sm text-muted-foreground">No line items extracted.</p>;
  }

  return (
    <div className="space-y-4">
      {actionsEnabled ? (
        <>
          <LineItemsActionBar
            selectedCount={selected.size}
            busyAction={busyAction}
            decisionsEnabled={decisionsEnabled}
            approveDisabled={allSelectedApproved}
            rejectDisabled={allSelectedRejected}
            onAction={handleAction}
          />

          <LineItemEditDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            items={selectedItems}
            busy={busyAction === "edit"}
            onSave={(fields) => void editSelected(fields)}
          />

          <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign selected lines</DialogTitle>
                <DialogDescription>
                  Choose who should review {selected.size} selected line
                  {selected.size === 1 ? "" : "s"}. Lines without an override use the invoice
                  assignee
                  {invoiceAssignedToLabel ? ` (${invoiceAssignedToLabel})` : ""}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="assign-dialog-user">Assign to</Label>
                <Select
                  items={assignSelectItems}
                  value={assigneeId}
                  onValueChange={(value) => value && setAssigneeId(value)}
                >
                  <SelectTrigger id="assign-dialog-user" className="w-full">
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoiceAssignedToId && invoiceAssignedToLabel ? (
                      <SelectItem value={invoiceAssignedToId}>
                        {invoiceAssignedToLabel} (invoice)
                      </SelectItem>
                    ) : (
                      <SelectItem value="__invoice__">Invoice assignee</SelectItem>
                    )}
                    {users
                      .filter((user) => user.id !== invoiceAssignedToId)
                      .map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {userLabel(user)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAssignDialogOpen(false)}
                  disabled={busyAction === "assign"}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={assignSelected}
                  disabled={busyAction === "assign" || !assigneeId}
                >
                  {busyAction === "assign" ? "Assigning..." : "Assign"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            {actionsEnabled ? (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  aria-label="Select all line items"
                />
              </TableHead>
            ) : null}
            <TableHead className="w-12">#</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned to</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lineItems.map((item, index) => (
            <TableRow
              key={`${item.lineNumber ?? index}-${item.description}`}
              data-state={selected.has(index) ? "selected" : undefined}
              className={actionsEnabled ? "cursor-pointer" : undefined}
              onClick={
                actionsEnabled
                  ? () => toggleLine(index, !selected.has(index))
                  : undefined
              }
            >
              {actionsEnabled ? (
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(index)}
                    onCheckedChange={(checked) => toggleLine(index, checked === true)}
                    aria-label={`Select line ${item.lineNumber ?? index + 1}`}
                  />
                </TableCell>
              ) : null}
              <TableCell>{item.lineNumber ?? index + 1}</TableCell>
              <TableCell>{item.description}</TableCell>
              <TableCell>{item.serviceType ?? "—"}</TableCell>
              <TableCell>{item.quantity ?? "—"}</TableCell>
              <TableCell>
                {item.unitPrice != null ? formatCurrency(item.unitPrice, currency) : "—"}
              </TableCell>
              <TableCell>
                {item.amount != null ? formatCurrency(item.amount, currency) : "—"}
              </TableCell>
              <TableCell>{item.reference ?? "—"}</TableCell>
              <TableCell>
                <LineStatusBadge status={resolveLineItemStatus(item)} />
              </TableCell>
              <TableCell>{displayAssignee(item)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
