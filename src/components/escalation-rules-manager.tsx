"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type UserOption = { id: string; name: string | null; email: string };
type EscalationRule = {
  id: string;
  name: string;
  priority: number;
  daysWithoutAction: number;
  enabled: boolean;
  escalateTo: UserOption | null;
};

type RuleFormState = {
  name: string;
  daysWithoutAction: string;
  escalateToUserId: string;
};

const EMPTY_FORM: RuleFormState = {
  name: "",
  daysWithoutAction: "5",
  escalateToUserId: "",
};

type EscalationRulesManagerProps = {
  initialRules: EscalationRule[];
  users: UserOption[];
};

export function EscalationRulesManager({
  initialRules,
  users,
}: EscalationRulesManagerProps) {
  const [rules, setRules] = useState(initialRules);
  const [error, setError] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingRule, setEditingRule] = useState<EscalationRule | null>(null);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const isSheetOpen = sheetMode != null;

  async function refreshRules() {
    const response = await fetch("/api/admin/escalation-rules");
    if (!response.ok) {
      setError("Failed to load escalation rules");
      return;
    }
    setRules(await response.json());
  }

  async function toggleEnabled(rule: EscalationRule) {
    const response = await fetch(`/api/admin/escalation-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });

    if (!response.ok) {
      setError("Failed to update rule");
      return;
    }

    await refreshRules();
  }

  async function deleteRule(rule: EscalationRule) {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;

    const response = await fetch(`/api/admin/escalation-rules/${rule.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setError("Failed to delete rule");
      return;
    }

    await refreshRules();
  }

  function openCreateSheet() {
    setSheetMode("create");
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function openEditSheet(rule: EscalationRule) {
    setSheetMode("edit");
    setEditingRule(rule);
    setForm({
      name: rule.name,
      daysWithoutAction: String(rule.daysWithoutAction),
      escalateToUserId: rule.escalateTo?.id ?? "",
    });
    setError(null);
  }

  function closeSheet() {
    setSheetMode(null);
    setEditingRule(null);
    setForm(EMPTY_FORM);
  }

  async function saveRule() {
    const trimmedName = form.name.trim();
    const daysWithoutAction = Number(form.daysWithoutAction);

    if (!trimmedName) {
      setError("Enter a name for the rule.");
      return;
    }

    if (
      !form.daysWithoutAction.trim() ||
      Number.isNaN(daysWithoutAction) ||
      daysWithoutAction < 1
    ) {
      setError("Enter a valid number of days (at least 1).");
      return;
    }

    if (!form.escalateToUserId) {
      setError("Select a user to escalate to.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (sheetMode === "create") {
        const lowestPriority =
          rules.length > 0 ? Math.min(...rules.map((rule) => rule.priority)) - 10 : 10;

        const response = await fetch("/api/admin/escalation-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            priority: lowestPriority,
            daysWithoutAction,
            escalateToUserId: form.escalateToUserId,
          }),
        });

        if (!response.ok) {
          setError("Failed to create rule");
          return;
        }
      } else if (sheetMode === "edit" && editingRule) {
        const response = await fetch(`/api/admin/escalation-rules/${editingRule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            daysWithoutAction,
            escalateToUserId: form.escalateToUserId,
          }),
        });

        if (!response.ok) {
          setError("Failed to update rule");
          return;
        }
      }

      closeSheet();
      await refreshRules();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && !isSheetOpen ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Escalation rules</CardTitle>
          <CardDescription>
            Reassign invoices when the assigned approver has not acted within a set number
            of days. Idle time is measured from when the invoice was last assigned.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead className="w-48">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    No escalation rules yet. Upload an invoice to seed a default, or create
                    one below.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id} className={rule.enabled ? undefined : "opacity-60"}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{rule.name}</p>
                        {!rule.enabled ? (
                          <Badge variant="destructive">Disabled</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        After {rule.daysWithoutAction}{" "}
                        {rule.daysWithoutAction === 1 ? "day" : "days"} without action,
                        escalate to{" "}
                        <span className="text-foreground">
                          {rule.escalateTo?.name ?? rule.escalateTo?.email ?? "No user"}
                        </span>
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEditSheet(rule)}
                        >
                          <PencilIcon />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => toggleEnabled(rule)}
                        >
                          {rule.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => deleteRule(rule)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
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
            New rule
          </Button>
        </CardFooter>
      </Card>

      <Sheet open={isSheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "create" ? "New escalation rule" : "Edit escalation rule"}
            </SheetTitle>
            <SheetDescription>
              Reassign the invoice when the current approver has not allocated an outcome
              within the configured timeframe.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4">
            {error && isSheetOpen ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="rule-name">Rule name</Label>
              <Input
                id="rule-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Escalate after 5 days without action"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-days">Days without action</Label>
              <Input
                id="rule-days"
                type="number"
                min="1"
                value={form.daysWithoutAction}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    daysWithoutAction: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Counted from when the invoice was last assigned to an approver.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-escalate-to">Escalate to</Label>
              <Select
                value={form.escalateToUserId}
                onValueChange={(next) =>
                  next && setForm((current) => ({ ...current, escalateToUserId: next }))
                }
              >
                <SelectTrigger id="rule-escalate-to">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name ?? user.email} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter className="px-4">
            <Button type="button" variant="outline" onClick={closeSheet}>
              Cancel
            </Button>
            <Button type="button" disabled={isSaving} onClick={saveRule}>
              {isSaving
                ? "Saving…"
                : sheetMode === "create"
                  ? "Create rule"
                  : "Save changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
