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
import type { RoutingRuleType } from "@/lib/db/types";
import {
  RULE_TYPE_INFO,
  buildRuleCondition,
  conditionFieldsFromRule,
  formatRuleCondition,
  formatRuleType,
} from "@/lib/routing-rule-display";

type UserOption = { id: string; name: string | null; email: string };
type RoutingRule = {
  id: string;
  name: string;
  priority: number;
  type: string;
  condition: string;
  isDefault: boolean;
  enabled: boolean;
  approver: UserOption | null;
};

type RoutingRulesManagerProps = {
  initialRules: RoutingRule[];
  users: UserOption[];
};

type RuleFormState = {
  name: string;
  type: RoutingRuleType;
  approverId: string;
  senderEmail: string;
  senderDomain: string;
  minAmount: string;
};

const EMPTY_FORM: RuleFormState = {
  name: "",
  type: "SENDER_EMAIL",
  approverId: "",
  senderEmail: "",
  senderDomain: "",
  minAmount: "",
};

function RuleTypeHelp({ type }: { type: RoutingRuleType }) {
  const info = RULE_TYPE_INFO[type];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="font-medium">{info.label}</p>
      <p className="mt-1 text-muted-foreground">{info.description}</p>
      <p className="mt-2 text-muted-foreground">
        <span className="font-medium text-foreground">Example: </span>
        {info.example}
      </p>
    </div>
  );
}

function RuleConditionFields({
  type,
  senderEmail,
  senderDomain,
  minAmount,
  onSenderEmailChange,
  onSenderDomainChange,
  onMinAmountChange,
  idPrefix,
}: {
  type: RoutingRuleType;
  senderEmail: string;
  senderDomain: string;
  minAmount: string;
  onSenderEmailChange: (value: string) => void;
  onSenderDomainChange: (value: string) => void;
  onMinAmountChange: (value: string) => void;
  idPrefix: string;
}) {
  if (type === "SENDER_EMAIL") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-senderEmail`}>Sender email</Label>
          <Input
            id={`${idPrefix}-senderEmail`}
            value={senderEmail}
            onChange={(event) => onSenderEmailChange(event.target.value)}
            placeholder="billing@acme.com"
          />
          <p className="text-xs text-muted-foreground">
            Exact vendor email from the invoice. Leave blank to match by domain only.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-senderDomain`}>Sender domain</Label>
          <Input
            id={`${idPrefix}-senderDomain`}
            value={senderDomain}
            onChange={(event) => onSenderDomainChange(event.target.value)}
            placeholder="acme.com"
          />
          <p className="text-xs text-muted-foreground">
            Matches any invoice from addresses ending in @acme.com.
          </p>
        </div>
      </div>
    );
  }

  if (type === "AMOUNT_THRESHOLD") {
    return (
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-minAmount`}>Minimum amount</Label>
        <Input
          id={`${idPrefix}-minAmount`}
          type="number"
          min="0"
          step="0.01"
          value={minAmount}
          onChange={(event) => onMinAmountChange(event.target.value)}
          placeholder="10000"
        />
        <p className="text-xs text-muted-foreground">
          Invoices with a total strictly greater than this value will match. Use the
          same number format as on the invoice (e.g. 10000 for $10,000).
        </p>
      </div>
    );
  }

  if (type === "PARSE_FAILURE") {
    return (
      <p className="text-sm text-muted-foreground">
        No extra settings needed. This rule matches invoices the system could not read
        from the PDF.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      No extra settings needed. This rule catches invoices that do not match any rule
      above it.
    </p>
  );
}

export function RoutingRulesManager({ initialRules, users }: RoutingRulesManagerProps) {
  const [rules, setRules] = useState(initialRules);
  const [error, setError] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const isSheetOpen = sheetMode != null;
  const existingDefaultRule = rules.find((rule) => rule.isDefault);
  const defaultTypeDisabled =
    existingDefaultRule != null && editingRule?.id !== existingDefaultRule.id;

  async function refreshRules() {
    const response = await fetch("/api/admin/routing-rules");
    if (!response.ok) {
      setError("Failed to load routing rules");
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

    const response = await fetch("/api/admin/routing-rules/reorder", {
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

  async function toggleEnabled(rule: RoutingRule) {
    const response = await fetch(`/api/admin/routing-rules/${rule.id}`, {
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

  async function deleteRule(rule: RoutingRule) {
    if (rule.isDefault) return;
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;

    const response = await fetch(`/api/admin/routing-rules/${rule.id}`, {
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

  function openEditSheet(rule: RoutingRule) {
    const fields = conditionFieldsFromRule(rule.type as RoutingRuleType, rule.condition);
    setSheetMode("edit");
    setEditingRule(rule);
    setForm({
      name: rule.name,
      type: rule.type as RoutingRuleType,
      approverId: rule.approver?.id ?? "",
      ...fields,
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

    if (!trimmedName) {
      setError("Enter a name for the rule.");
      return;
    }

    if (!form.approverId) {
      setError("Select an approver for this rule.");
      return;
    }

    const { condition, error: conditionError } = buildRuleCondition(form.type, {
      senderEmail: form.senderEmail,
      senderDomain: form.senderDomain,
      minAmount: form.minAmount,
    });

    if (conditionError) {
      setError(conditionError);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (sheetMode === "create") {
        const lowestPriority =
          rules.length > 0 ? Math.min(...rules.map((rule) => rule.priority)) - 10 : 10;

        const response = await fetch("/api/admin/routing-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            priority: lowestPriority,
            type: form.type,
            condition,
            approverId: form.approverId,
            isDefault: form.type === "DEFAULT",
          }),
        });

        if (!response.ok) {
          setError("Failed to create rule");
          return;
        }
      } else if (sheetMode === "edit" && editingRule) {
        const response = await fetch(`/api/admin/routing-rules/${editingRule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            type: form.type,
            condition,
            approverId: form.approverId,
            isDefault: form.type === "DEFAULT",
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
          <CardTitle>Active rules</CardTitle>
          <CardDescription>
            Rules are checked from top to bottom. The first matching rule assigns the
            invoice. Use the arrows to change priority.
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
                    No routing rules yet. Create one below or upload an invoice to seed
                    defaults.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule, index) => (
                  <TableRow key={rule.id} className={rule.enabled ? undefined : "opacity-60"}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{rule.name}</p>
                        <Badge variant="outline">{formatRuleType(rule.type)}</Badge>
                        {rule.isDefault ? (
                          <Badge variant="secondary">Catch-all</Badge>
                        ) : null}
                        {!rule.enabled ? (
                          <Badge variant="destructive">Disabled</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatRuleCondition(rule.type, rule.condition)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Assigns to{" "}
                        <span className="text-foreground">
                          {rule.approver?.name ?? rule.approver?.email ?? "No approver"}
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
                        {!rule.isDefault ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => deleteRule(rule)}
                          >
                            <Trash2Icon />
                          </Button>
                        ) : null}
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
              {sheetMode === "create" ? "New routing rule" : "Edit routing rule"}
            </SheetTitle>
            <SheetDescription>
              {sheetMode === "create"
                ? "Define when this rule matches and who receives the invoice. New rules start at the lowest priority — move them up once saved if needed."
                : "Update how this rule matches invoices and who they are assigned to."}
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
                placeholder="High-value Acme invoices"
              />
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="rule-type">Rule type</Label>
                <Select
                  value={form.type}
                  onValueChange={(next) =>
                    next && setForm((current) => ({ ...current, type: next as RoutingRuleType }))
                  }
                >
                  <SelectTrigger id="rule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SENDER_EMAIL">
                      {RULE_TYPE_INFO.SENDER_EMAIL.label}
                    </SelectItem>
                    <SelectItem value="AMOUNT_THRESHOLD">
                      {RULE_TYPE_INFO.AMOUNT_THRESHOLD.label}
                    </SelectItem>
                    <SelectItem value="PARSE_FAILURE">
                      {RULE_TYPE_INFO.PARSE_FAILURE.label}
                    </SelectItem>
                    <SelectItem value="DEFAULT" disabled={defaultTypeDisabled}>
                      {RULE_TYPE_INFO.DEFAULT.label}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <RuleTypeHelp type={form.type} />
            </div>

            <RuleConditionFields
              type={form.type}
              senderEmail={form.senderEmail}
              senderDomain={form.senderDomain}
              minAmount={form.minAmount}
              onSenderEmailChange={(value) =>
                setForm((current) => ({ ...current, senderEmail: value }))
              }
              onSenderDomainChange={(value) =>
                setForm((current) => ({ ...current, senderDomain: value }))
              }
              onMinAmountChange={(value) =>
                setForm((current) => ({ ...current, minAmount: value }))
              }
              idPrefix="rule"
            />

            <div className="space-y-2">
              <Label htmlFor="rule-approver">Assign to</Label>
              <Select
                value={form.approverId}
                onValueChange={(next) =>
                  next && setForm((current) => ({ ...current, approverId: next }))
                }
              >
                <SelectTrigger id="rule-approver">
                  <SelectValue placeholder="Select approver" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name ?? user.email} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The user who will receive matching invoices in their approval queue.
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
