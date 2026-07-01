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
import type { ResponseDueRuleAnchor, ResponseDueRuleDirection } from "@/lib/db/types";
import {
  ANCHOR_INFO,
  DIRECTION_INFO,
  formatResponseDueRule,
} from "@/lib/response-due-rule-display";

type ResponseDueRule = {
  id: string;
  name: string;
  priority: number;
  anchor: string;
  offsetDays: number;
  direction: string;
  enabled: boolean;
};

type RuleFormState = {
  name: string;
  anchor: ResponseDueRuleAnchor;
  direction: ResponseDueRuleDirection;
  offsetDays: string;
};

const EMPTY_FORM: RuleFormState = {
  name: "",
  anchor: "INVOICE_DUE_DATE",
  direction: "BEFORE",
  offsetDays: "7",
};

type ResponseDueRulesManagerProps = {
  initialRules: ResponseDueRule[];
};

export function ResponseDueRulesManager({ initialRules }: ResponseDueRulesManagerProps) {
  const [rules, setRules] = useState(initialRules);
  const [error, setError] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingRule, setEditingRule] = useState<ResponseDueRule | null>(null);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const isSheetOpen = sheetMode != null;

  async function refreshRules() {
    const response = await fetch("/api/admin/response-due-rules");
    if (!response.ok) {
      setError("Failed to load response due rules");
      return;
    }
    setRules(await response.json());
  }

  async function moveRule(id: string, direction: "up" | "down") {
    const index = rules.findIndex((rule) => rule.id === id);
    if (index < 0) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rules.length) return;

    const reordered = [...rules];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, removed);

    const response = await fetch("/api/admin/response-due-rules/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: reordered.map((rule) => rule.id) }),
    });

    if (!response.ok) {
      setError("Failed to reorder rules");
      return;
    }

    await refreshRules();
  }

  async function toggleEnabled(rule: ResponseDueRule) {
    const response = await fetch(`/api/admin/response-due-rules/${rule.id}`, {
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

  async function deleteRule(rule: ResponseDueRule) {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;

    const response = await fetch(`/api/admin/response-due-rules/${rule.id}`, {
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

  function openEditSheet(rule: ResponseDueRule) {
    setSheetMode("edit");
    setEditingRule(rule);
    setForm({
      name: rule.name,
      anchor: rule.anchor as ResponseDueRuleAnchor,
      direction: rule.direction as ResponseDueRuleDirection,
      offsetDays: String(rule.offsetDays),
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
    const offsetDays = Number(form.offsetDays);

    if (!trimmedName) {
      setError("Enter a name for the rule.");
      return;
    }

    if (!form.offsetDays.trim() || Number.isNaN(offsetDays) || offsetDays < 0) {
      setError("Enter a valid number of days.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (sheetMode === "create") {
        const lowestPriority =
          rules.length > 0 ? Math.min(...rules.map((rule) => rule.priority)) - 10 : 10;

        const response = await fetch("/api/admin/response-due-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            priority: lowestPriority,
            anchor: form.anchor,
            direction: form.direction,
            offsetDays,
          }),
        });

        if (!response.ok) {
          setError("Failed to create rule");
          return;
        }
      } else if (sheetMode === "edit" && editingRule) {
        const response = await fetch(`/api/admin/response-due-rules/${editingRule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            anchor: form.anchor,
            direction: form.direction,
            offsetDays,
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
          <CardTitle>Response due rules</CardTitle>
          <CardDescription>
            Define when an assigned approver must allocate an outcome (paid, credit, or
            rejected). Rules are checked from top to bottom — the first rule whose anchor
            date is available on the invoice wins.
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
                    No response due rules yet. Upload an invoice to seed defaults, or create
                    one below.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule, index) => (
                  <TableRow key={rule.id} className={rule.enabled ? undefined : "opacity-60"}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{rule.name}</p>
                        {!rule.enabled ? (
                          <Badge variant="destructive">Disabled</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Response due{" "}
                        {formatResponseDueRule(rule.anchor, rule.offsetDays, rule.direction)}
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
                          onClick={() => moveRule(rule.id, "up")}
                          disabled={index === 0}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => moveRule(rule.id, "down")}
                          disabled={index === rules.length - 1}
                        >
                          ↓
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
              {sheetMode === "create" ? "New response due rule" : "Edit response due rule"}
            </SheetTitle>
            <SheetDescription>
              Set the deadline by which the assigned approver must act on the invoice.
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
                placeholder="7 days before invoice due date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-anchor">Anchor date</Label>
              <Select
                value={form.anchor}
                onValueChange={(next) =>
                  next &&
                  setForm((current) => ({
                    ...current,
                    anchor: next as ResponseDueRuleAnchor,
                  }))
                }
              >
                <SelectTrigger id="rule-anchor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ANCHOR_INFO) as ResponseDueRuleAnchor[]).map((anchor) => (
                    <SelectItem key={anchor} value={anchor}>
                      {ANCHOR_INFO[anchor].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ANCHOR_INFO[form.anchor].description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rule-direction">Direction</Label>
                <Select
                  value={form.direction}
                  onValueChange={(next) =>
                    next &&
                    setForm((current) => ({
                      ...current,
                      direction: next as ResponseDueRuleDirection,
                    }))
                  }
                >
                  <SelectTrigger id="rule-direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DIRECTION_INFO) as ResponseDueRuleDirection[]).map(
                      (direction) => (
                        <SelectItem key={direction} value={direction}>
                          {DIRECTION_INFO[direction].label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-offset">Days</Label>
                <Input
                  id="rule-offset"
                  type="number"
                  min="0"
                  value={form.offsetDays}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, offsetDays: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Preview</p>
              <p className="mt-1 text-muted-foreground">
                Response due{" "}
                {formatResponseDueRule(
                  form.anchor,
                  Number(form.offsetDays) || 0,
                  form.direction,
                )}
              </p>
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
