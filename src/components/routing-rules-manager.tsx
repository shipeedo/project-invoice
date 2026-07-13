"use client";

import {
  ArrowRightIcon,
  AtSignIcon,
  BanknoteIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  FileWarningIcon,
  InboxIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
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
import type { RoutingRuleType } from "@/lib/db/types";
import { formatCurrency } from "@/lib/format";
import {
  buildRuleCondition,
  conditionFieldsFromRule,
  formatRuleCondition,
} from "@/lib/routing-rule-display";
import { cn } from "@/lib/utils";

type UserOption = { id: string; name: string | null; email: string };
type SupplierOption = { id: string; name: string };

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

type EscalationRule = {
  id: string;
  watchedUserId: string | null;
  afterBusinessDays: number;
  escalateToId: string | null;
  enabled: boolean;
  watchedUser: UserOption | null;
  escalateTo: UserOption | null;
};

type RoutingRulesManagerProps = {
  initialRules: RoutingRule[];
  initialEscalations: EscalationRule[];
  users: UserOption[];
  suppliers: SupplierOption[];
};

function userLabel(user: UserOption | null | undefined): string {
  return user?.name?.trim() || user?.email || "Nobody";
}

function userInitials(user: UserOption | null | undefined): string {
  const source = user?.name?.trim() || user?.email || "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[1]?.[0] : source[1];
  return `${first}${second ?? ""}`.toUpperCase();
}

function UserChip({ user }: { user: UserOption | null | undefined }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-7 shrink-0">
        <AvatarFallback className="text-[10px]">
          {userInitials(user)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight">
          {userLabel(user)}
        </p>
        {user?.email ? (
          <p className="truncate text-xs text-muted-foreground leading-tight">
            {user.email}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function UserSelectItems({ users }: { users: UserOption[] }) {
  return (
    <>
      {users.map((user) => (
        <SelectItem key={user.id} value={user.id}>
          {user.name ? `${user.name} (${user.email})` : user.email}
        </SelectItem>
      ))}
    </>
  );
}

// Base UI's SelectValue renders the raw value unless the root receives
// items mapping values to display labels.
function userSelectLabels(users: UserOption[]): Record<string, string> {
  return Object.fromEntries(users.map((user) => [user.id, userLabel(user)]));
}

// ---------------------------------------------------------------------------
// Routing rule form
// ---------------------------------------------------------------------------

type RuleFormState = {
  name: string;
  nameEdited: boolean;
  type: RoutingRuleType;
  approverId: string;
  supplierId: string;
  senderEmail: string;
  senderDomain: string;
  minAmount: string;
};

const EMPTY_RULE_FORM: RuleFormState = {
  name: "",
  nameEdited: false,
  type: "SUPPLIER",
  approverId: "",
  supplierId: "",
  senderEmail: "",
  senderDomain: "",
  minAmount: "",
};

const CONDITION_CHOICES: Array<{
  type: RoutingRuleType;
  title: string;
  blurb: string;
  icon: typeof AtSignIcon;
}> = [
  {
    type: "SUPPLIER",
    title: "From a supplier",
    blurb: "Route every invoice from one of your suppliers",
    icon: AtSignIcon,
  },
  {
    type: "AMOUNT_THRESHOLD",
    title: "Over an amount",
    blurb: "Match invoices above a dollar amount",
    icon: BanknoteIcon,
  },
  {
    type: "PARSE_FAILURE",
    title: "Couldn't be read",
    blurb: "Match invoices that failed automatic extraction",
    icon: FileWarningIcon,
  },
];

function supplierName(suppliers: SupplierOption[], id: string): string | null {
  return suppliers.find((supplier) => supplier.id === id)?.name ?? null;
}

function suggestRuleName(form: RuleFormState, suppliers: SupplierOption[]): string {
  switch (form.type) {
    case "SUPPLIER": {
      const name = supplierName(suppliers, form.supplierId);
      return name ? `Invoices from ${name}` : "";
    }
    case "SENDER_EMAIL": {
      const email = form.senderEmail.trim();
      if (email) return `Invoices from ${email}`;
      const domain = form.senderDomain.trim();
      return domain ? `Invoices from @${domain}` : "";
    }
    case "AMOUNT_THRESHOLD": {
      const amount = Number(form.minAmount);
      return form.minAmount.trim() && !Number.isNaN(amount)
        ? `Over ${formatCurrency(amount)}`
        : "";
    }
    case "PARSE_FAILURE":
      return "Unreadable invoices";
    case "DEFAULT":
      return "Everything else";
  }
}

function describeRuleCondition(
  form: RuleFormState,
  suppliers: SupplierOption[],
): string | null {
  switch (form.type) {
    case "SUPPLIER": {
      const name = supplierName(suppliers, form.supplierId);
      return name ? `from ${name}` : null;
    }
    case "SENDER_EMAIL": {
      const email = form.senderEmail.trim();
      const domain = form.senderDomain.trim();
      if (email) return `from ${email}`;
      if (domain) return `from anyone @${domain}`;
      return null;
    }
    case "AMOUNT_THRESHOLD": {
      const amount = Number(form.minAmount);
      if (!form.minAmount.trim() || Number.isNaN(amount)) return null;
      return `over ${formatCurrency(amount)}`;
    }
    case "PARSE_FAILURE":
      return "that can't be read automatically";
    case "DEFAULT":
      return "that match no other rule";
  }
}

function RulePreview({
  form,
  users,
  suppliers,
}: {
  form: RuleFormState;
  users: UserOption[];
  suppliers: SupplierOption[];
}) {
  const condition = describeRuleCondition(form, suppliers);
  const approver = users.find((user) => user.id === form.approverId);

  return (
    <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm">
      {condition && approver ? (
        <p>
          Invoices <span className="font-medium">{condition}</span> will go to{" "}
          <span className="font-medium">{userLabel(approver)}</span>.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Fill in the details above to see what this rule will do.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Escalation form
// ---------------------------------------------------------------------------

const ANYONE = "anyone";

type EscalationFormState = {
  watchedUserId: string; // ANYONE or a user id
  afterDays: string;
  escalateToId: string;
};

const EMPTY_ESCALATION_FORM: EscalationFormState = {
  watchedUserId: ANYONE,
  afterDays: "3",
  escalateToId: "",
};

function EscalationPreview({
  form,
  users,
}: {
  form: EscalationFormState;
  users: UserOption[];
}) {
  const target = users.find((user) => user.id === form.escalateToId);
  const watched =
    form.watchedUserId === ANYONE
      ? "anyone"
      : userLabel(users.find((user) => user.id === form.watchedUserId));
  const days = Number(form.afterDays);
  const ready = target && Number.isInteger(days) && days >= 1;

  return (
    <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm">
      {ready ? (
        <p>
          If <span className="font-medium">{watched}</span>{" "}
          hasn&apos;t actioned an invoice within{" "}
          <span className="font-medium">
            {days} business {days === 1 ? "day" : "days"}
          </span>
          , it moves to <span className="font-medium">{userLabel(target)}</span>.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Fill in the details above to see what this escalation will do.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

type RuleSheetState =
  | { mode: "create"; catchAll: boolean }
  | { mode: "edit"; rule: RoutingRule }
  | null;

type EscalationSheetState =
  | { mode: "create" }
  | { mode: "edit"; rule: EscalationRule }
  | null;

export function RoutingRulesManager({
  initialRules,
  initialEscalations,
  users,
  suppliers,
}: RoutingRulesManagerProps) {
  const [rules, setRules] = useState(initialRules);
  const [escalations, setEscalations] = useState(initialEscalations);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [ruleSheet, setRuleSheet] = useState<RuleSheetState>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(EMPTY_RULE_FORM);

  const [escalationSheet, setEscalationSheet] = useState<EscalationSheetState>(null);
  const [escalationForm, setEscalationForm] = useState<EscalationFormState>(
    EMPTY_ESCALATION_FORM,
  );

  const orderedRules = rules.filter((rule) => !rule.isDefault);
  const catchAllRule = rules.find((rule) => rule.isDefault) ?? null;

  // -- routing rules ---------------------------------------------------------

  async function refreshRules() {
    const response = await fetch("/api/admin/routing-rules");
    if (!response.ok) {
      setPageError("Couldn't refresh routing rules. Reload the page to see the latest.");
      return;
    }
    setRules(await response.json());
  }

  async function moveRule(id: string, direction: "up" | "down") {
    const index = orderedRules.findIndex((rule) => rule.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= orderedRules.length) return;

    const reordered = [...orderedRules];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, removed);

    // The catch-all always stays last; the API renumbers everything it is sent.
    const orderedIds = [
      ...reordered.map((rule) => rule.id),
      ...rules.filter((rule) => rule.isDefault).map((rule) => rule.id),
    ];

    const response = await fetch("/api/admin/routing-rules/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });

    if (!response.ok) {
      setPageError("Couldn't reorder the rules. Try again.");
      return;
    }

    setRules(await response.json());
  }

  async function toggleRuleEnabled(rule: RoutingRule) {
    const response = await fetch(`/api/admin/routing-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });

    if (!response.ok) {
      setPageError(`Couldn't ${rule.enabled ? "pause" : "resume"} the rule. Try again.`);
      return;
    }

    await refreshRules();
  }

  async function deleteRule(rule: RoutingRule) {
    if (rule.isDefault) return;
    if (!window.confirm(`Delete the rule "${rule.name}"?`)) return;

    const response = await fetch(`/api/admin/routing-rules/${rule.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setPageError("Couldn't delete the rule. Try again.");
      return;
    }

    await refreshRules();
  }

  function openCreateRule(catchAll = false) {
    setRuleSheet({ mode: "create", catchAll });
    setRuleForm({
      ...EMPTY_RULE_FORM,
      type: catchAll ? "DEFAULT" : suppliers.length > 0 ? "SUPPLIER" : "SENDER_EMAIL",
      name: catchAll ? "Everything else" : "",
    });
    setFormError(null);
  }

  function openEditRule(rule: RoutingRule) {
    const fields = conditionFieldsFromRule(rule.type as RoutingRuleType, rule.condition);
    setRuleSheet({ mode: "edit", rule });
    setRuleForm({
      name: rule.name,
      nameEdited: true,
      type: rule.type as RoutingRuleType,
      approverId: rule.approver?.id ?? "",
      ...fields,
    });
    setFormError(null);
  }

  function updateRuleForm(patch: Partial<RuleFormState>) {
    setRuleForm((current) => {
      const next = { ...current, ...patch };
      if (!next.nameEdited) {
        next.name = suggestRuleName(next, suppliers);
      }
      return next;
    });
  }

  async function saveRule() {
    if (!ruleSheet) return;
    const trimmedName = ruleForm.name.trim() || suggestRuleName(ruleForm, suppliers);

    if (!ruleForm.approverId) {
      setFormError("Choose who these invoices should go to.");
      return;
    }

    const { condition, error: conditionError } = buildRuleCondition(ruleForm.type, {
      supplierId: ruleForm.supplierId,
      supplierName: supplierName(suppliers, ruleForm.supplierId) ?? undefined,
      senderEmail: ruleForm.senderEmail,
      senderDomain: ruleForm.senderDomain,
      minAmount: ruleForm.minAmount,
    });

    if (conditionError) {
      setFormError(conditionError);
      return;
    }

    if (!trimmedName) {
      setFormError("Give the rule a name.");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      if (ruleSheet.mode === "create") {
        const lowestPriority =
          rules.length > 0 ? Math.min(...rules.map((rule) => rule.priority)) - 10 : 10;

        const response = await fetch("/api/admin/routing-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            priority: ruleForm.type === "DEFAULT" ? lowestPriority - 10 : lowestPriority,
            type: ruleForm.type,
            condition,
            approverId: ruleForm.approverId,
            isDefault: ruleForm.type === "DEFAULT",
          }),
        });

        if (!response.ok) {
          setFormError("Couldn't create the rule. Try again.");
          return;
        }
      } else {
        const response = await fetch(`/api/admin/routing-rules/${ruleSheet.rule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            type: ruleForm.type,
            condition,
            approverId: ruleForm.approverId,
            isDefault: ruleForm.type === "DEFAULT",
          }),
        });

        if (!response.ok) {
          setFormError("Couldn't save the rule. Try again.");
          return;
        }
      }

      setRuleSheet(null);
      await refreshRules();
    } finally {
      setIsSaving(false);
    }
  }

  // -- escalation rules ------------------------------------------------------

  async function refreshEscalations() {
    const response = await fetch("/api/admin/escalation-rules");
    if (!response.ok) {
      setPageError(
        "Couldn't refresh escalation rules. Reload the page to see the latest.",
      );
      return;
    }
    setEscalations(await response.json());
  }

  async function toggleEscalationEnabled(rule: EscalationRule) {
    const response = await fetch(`/api/admin/escalation-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });

    if (!response.ok) {
      setPageError(
        `Couldn't ${rule.enabled ? "pause" : "resume"} the escalation. Try again.`,
      );
      return;
    }

    await refreshEscalations();
  }

  async function deleteEscalation(rule: EscalationRule) {
    if (!window.confirm("Delete this escalation?")) return;

    const response = await fetch(`/api/admin/escalation-rules/${rule.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setPageError("Couldn't delete the escalation. Try again.");
      return;
    }

    await refreshEscalations();
  }

  function openCreateEscalation() {
    setEscalationSheet({ mode: "create" });
    setEscalationForm(EMPTY_ESCALATION_FORM);
    setFormError(null);
  }

  function openEditEscalation(rule: EscalationRule) {
    setEscalationSheet({ mode: "edit", rule });
    setEscalationForm({
      watchedUserId: rule.watchedUserId ?? ANYONE,
      afterDays: String(rule.afterBusinessDays),
      escalateToId: rule.escalateToId ?? "",
    });
    setFormError(null);
  }

  async function saveEscalation() {
    if (!escalationSheet) return;

    const days = Number(escalationForm.afterDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      setFormError("Enter a wait between 1 and 30 business days.");
      return;
    }

    if (!escalationForm.escalateToId) {
      setFormError("Choose who the invoice should be reassigned to.");
      return;
    }

    if (
      escalationForm.watchedUserId !== ANYONE &&
      escalationForm.watchedUserId === escalationForm.escalateToId
    ) {
      setFormError("Pick a different person to reassign to — this would hand the invoice back to the same person.");
      return;
    }

    const payload = {
      watchedUserId:
        escalationForm.watchedUserId === ANYONE ? null : escalationForm.watchedUserId,
      afterBusinessDays: days,
      escalateToId: escalationForm.escalateToId,
    };

    setIsSaving(true);
    setFormError(null);

    try {
      const response =
        escalationSheet.mode === "create"
          ? await fetch("/api/admin/escalation-rules", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/admin/escalation-rules/${escalationSheet.rule.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setFormError(body?.error ?? "Couldn't save the escalation. Try again.");
        return;
      }

      setEscalationSheet(null);
      await refreshEscalations();
    } finally {
      setIsSaving(false);
    }
  }

  // -- rendering ---------------------------------------------------------------

  const isCatchAllSheet =
    (ruleSheet?.mode === "create" && ruleSheet.catchAll) ||
    (ruleSheet?.mode === "edit" && ruleSheet.rule.isDefault);

  const userLabels = userSelectLabels(users);
  const supplierLabels = Object.fromEntries(
    suppliers.map((supplier) => [supplier.id, supplier.name]),
  );

  return (
    <div className="space-y-6">
      {pageError ? (
        <Alert variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle>Routing order</CardTitle>
          <CardDescription>
            Checked top to bottom — the first matching rule decides who approves the
            invoice.
          </CardDescription>
          <CardAction>
            <Button type="button" onClick={() => openCreateRule()}>
              <PlusIcon />
              New rule
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {orderedRules.length === 0 ? (
            <div className="border-t px-6 py-8 text-center">
              <p className="text-sm font-medium">No routing rules yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Create a rule to send a supplier&apos;s invoices, high-value invoices, or
                unreadable ones to the right approver.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => openCreateRule()}
              >
                <PlusIcon />
                Create your first rule
              </Button>
            </div>
          ) : (
            <ul className="divide-y border-t">
              {orderedRules.map((rule, index) => (
                <li
                  key={rule.id}
                  className="flex items-center gap-2 py-3 pl-3 pr-4 sm:gap-3"
                >
                  <div className="flex shrink-0 items-center">
                    <span className="w-6 text-center font-mono text-sm text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <div className="flex flex-col">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-5 text-muted-foreground"
                        onClick={() => moveRule(rule.id, "up")}
                        disabled={index === 0}
                        aria-label={`Move "${rule.name}" up`}
                      >
                        <ChevronUpIcon className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-5 text-muted-foreground"
                        onClick={() => moveRule(rule.id, "down")}
                        disabled={index === orderedRules.length - 1}
                        aria-label={`Move "${rule.name}" down`}
                      >
                        <ChevronDownIcon className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className={cn("min-w-0 flex-1", !rule.enabled && "opacity-50")}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate font-medium">{rule.name}</p>
                      {!rule.enabled ? <Badge variant="outline">Paused</Badge> : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {formatRuleCondition(rule.type, rule.condition)}
                    </p>
                  </div>

                  <ArrowRightIcon
                    className={cn(
                      "hidden size-4 shrink-0 text-muted-foreground/50 sm:block",
                      !rule.enabled && "opacity-50",
                    )}
                  />

                  <div
                    className={cn(
                      "hidden w-52 shrink-0 sm:block",
                      !rule.enabled && "opacity-50",
                    )}
                  >
                    <UserChip user={rule.approver} />
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground"
                          aria-label={`Actions for "${rule.name}"`}
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditRule(rule)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleRuleEnabled(rule)}>
                        {rule.enabled ? "Pause" : "Resume"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => deleteRule(rule)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2 rounded-b-xl border-t bg-muted/40 py-3 pl-4 pr-4 sm:gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
              <InboxIcon className="size-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Everything else</p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                Invoices that match none of the rules above
              </p>
            </div>
            {catchAllRule ? (
              <>
                <ArrowRightIcon className="hidden size-4 shrink-0 text-muted-foreground/50 sm:block" />
                <div className="hidden w-52 shrink-0 sm:block">
                  <UserChip user={catchAllRule.approver} />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground"
                        aria-label={`Actions for "${catchAllRule.name}"`}
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditRule(catchAllRule)}>
                      Edit
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => openCreateRule(true)}
              >
                Choose an approver
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Escalations</CardTitle>
          <CardDescription>
            Reassign invoices that sit untouched so nothing misses its deadline.
          </CardDescription>
          <CardAction>
            <Button type="button" variant="outline" onClick={openCreateEscalation}>
              <PlusIcon />
              Add escalation
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {escalations.length === 0 ? (
            <div className="rounded-lg border border-dashed px-6 py-8 text-center">
              <ClockIcon className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No escalations yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Invoices can sit unnoticed in someone&apos;s queue. Add an escalation to
                reassign them automatically — for example, anything untouched for 3
                business days.
              </p>
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {escalations.map((rule) => (
                <li key={rule.id} className="flex items-center gap-3 px-4 py-3">
                  <ClockIcon
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground",
                      !rule.enabled && "opacity-50",
                    )}
                  />
                  <div className={cn("min-w-0 flex-1", !rule.enabled && "opacity-50")}>
                    <p className="text-sm">
                      If{" "}
                      <span className="font-medium">
                        {rule.watchedUser ? userLabel(rule.watchedUser) : "anyone"}
                      </span>{" "}
                      hasn&apos;t actioned an invoice within{" "}
                      <span className="font-medium">
                        {rule.afterBusinessDays} business{" "}
                        {rule.afterBusinessDays === 1 ? "day" : "days"}
                      </span>
                      , reassign it to{" "}
                      <span className="font-medium">{userLabel(rule.escalateTo)}</span>.
                    </p>
                  </div>
                  {!rule.enabled ? <Badge variant="outline">Paused</Badge> : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground"
                          aria-label="Escalation actions"
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditEscalation(rule)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleEscalationEnabled(rule)}>
                        {rule.enabled ? "Pause" : "Resume"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => deleteEscalation(rule)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Business days exclude weekends. Reassigning restarts the clock, and invoices
            on hold are left alone.
          </p>
        </CardContent>
      </Card>

      {/* Routing rule sheet */}
      <Sheet open={ruleSheet != null} onOpenChange={(open) => !open && setRuleSheet(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {isCatchAllSheet
                ? "Catch-all approver"
                : ruleSheet?.mode === "edit"
                  ? "Edit rule"
                  : "New rule"}
            </SheetTitle>
            <SheetDescription>
              {isCatchAllSheet
                ? "Choose who receives invoices that match none of your rules."
                : "Pick what the rule matches and who approves those invoices."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-4">
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            {!isCatchAllSheet ? (
              <div className="space-y-3">
                <Label>When an invoice is…</Label>
                <div className="grid gap-2" role="radiogroup" aria-label="Rule condition">
                  {CONDITION_CHOICES.map((choice) => {
                    // Manual email/domain matching lives behind the supplier card.
                    const selected =
                      ruleForm.type === choice.type ||
                      (choice.type === "SUPPLIER" && ruleForm.type === "SENDER_EMAIL");
                    const Icon = choice.icon;
                    return (
                      <button
                        key={choice.type}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() =>
                          updateRuleForm({
                            type:
                              choice.type === "SUPPLIER" && suppliers.length === 0
                                ? "SENDER_EMAIL"
                                : choice.type,
                          })
                        }
                        className={cn(
                          "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                          selected
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50",
                        )}
                      >
                        <Icon
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            selected ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {choice.title}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {choice.blurb}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {ruleForm.type === "SUPPLIER" ? (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    <Label htmlFor="rule-supplier">Supplier</Label>
                    <Select
                      items={supplierLabels}
                      value={ruleForm.supplierId || null}
                      onValueChange={(next) =>
                        next && updateRuleForm({ supplierId: next })
                      }
                    >
                      <SelectTrigger id="rule-supplier" className="w-full">
                        <SelectValue placeholder="Choose a supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Matches every invoice linked to this supplier, whichever
                      address they send from.
                    </p>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0 text-xs"
                      onClick={() => updateRuleForm({ type: "SENDER_EMAIL" })}
                    >
                      Match an email or domain instead
                    </Button>
                  </div>
                ) : null}

                {ruleForm.type === "SENDER_EMAIL" ? (
                  <div className="space-y-4 rounded-lg border bg-muted/30 p-3">
                    <div className="space-y-2">
                      <Label htmlFor="rule-sender-email">Supplier email</Label>
                      <Input
                        id="rule-sender-email"
                        value={ruleForm.senderEmail}
                        onChange={(event) =>
                          updateRuleForm({ senderEmail: event.target.value })
                        }
                        placeholder="billing@acme.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rule-sender-domain">
                        …or a whole domain
                      </Label>
                      <Input
                        id="rule-sender-domain"
                        value={ruleForm.senderDomain}
                        onChange={(event) =>
                          updateRuleForm({ senderDomain: event.target.value })
                        }
                        placeholder="acme.com"
                      />
                      <p className="text-xs text-muted-foreground">
                        Matches every address ending in @acme.com. Fill in either
                        field — the exact email wins if both are set.
                      </p>
                    </div>
                    {suppliers.length > 0 ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0 text-xs"
                        onClick={() => updateRuleForm({ type: "SUPPLIER" })}
                      >
                        Choose a supplier instead
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {ruleForm.type === "AMOUNT_THRESHOLD" ? (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    <Label htmlFor="rule-min-amount">Amount above</Label>
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText>$</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id="rule-min-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={ruleForm.minAmount}
                        onChange={(event) =>
                          updateRuleForm({ minAmount: event.target.value })
                        }
                        placeholder="10000"
                      />
                    </InputGroup>
                    <p className="text-xs text-muted-foreground">
                      Matches invoices with a total greater than this amount.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="rule-approver">
                {isCatchAllSheet ? "Send those invoices to" : "…send it to"}
              </Label>
              <Select
                items={userLabels}
                value={ruleForm.approverId || null}
                onValueChange={(next) =>
                  next && updateRuleForm({ approverId: next })
                }
              >
                <SelectTrigger id="rule-approver" className="w-full">
                  <SelectValue placeholder="Choose an approver" />
                </SelectTrigger>
                <SelectContent>
                  <UserSelectItems users={users} />
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Matching invoices land in this person&apos;s approval queue.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-name">Rule name</Label>
              <Input
                id="rule-name"
                value={ruleForm.name}
                onChange={(event) =>
                  setRuleForm((current) => ({
                    ...current,
                    name: event.target.value,
                    nameEdited: event.target.value.trim().length > 0,
                  }))
                }
                placeholder="We'll suggest one as you type"
              />
            </div>

            {!isCatchAllSheet ? (
              <RulePreview form={ruleForm} users={users} suppliers={suppliers} />
            ) : null}
          </div>

          <SheetFooter className="px-4">
            <Button type="button" variant="outline" onClick={() => setRuleSheet(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={isSaving} onClick={saveRule}>
              {isSaving
                ? "Saving…"
                : ruleSheet?.mode === "create"
                  ? "Create rule"
                  : "Save changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Escalation sheet */}
      <Sheet
        open={escalationSheet != null}
        onOpenChange={(open) => !open && setEscalationSheet(null)}
      >
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {escalationSheet?.mode === "edit" ? "Edit escalation" : "New escalation"}
            </SheetTitle>
            <SheetDescription>
              Reassign an invoice when it sits with someone too long.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-4">
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="escalation-watched">If an invoice is waiting on</Label>
              <Select
                items={{ [ANYONE]: "Anyone", ...userLabels }}
                value={escalationForm.watchedUserId}
                onValueChange={(next) =>
                  next &&
                  setEscalationForm((current) => ({ ...current, watchedUserId: next }))
                }
              >
                <SelectTrigger id="escalation-watched" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANYONE}>Anyone</SelectItem>
                  <UserSelectItems users={users} />
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="escalation-days">For longer than</Label>
              <InputGroup>
                <InputGroupInput
                  id="escalation-days"
                  type="number"
                  min="1"
                  max="30"
                  step="1"
                  value={escalationForm.afterDays}
                  onChange={(event) =>
                    setEscalationForm((current) => ({
                      ...current,
                      afterDays: event.target.value,
                    }))
                  }
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>business days</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="escalation-target">Reassign it to</Label>
              <Select
                items={userLabels}
                value={escalationForm.escalateToId || null}
                onValueChange={(next) =>
                  next &&
                  setEscalationForm((current) => ({ ...current, escalateToId: next }))
                }
              >
                <SelectTrigger id="escalation-target" className="w-full">
                  <SelectValue placeholder="Choose a person" />
                </SelectTrigger>
                <SelectContent>
                  <UserSelectItems users={users} />
                </SelectContent>
              </Select>
            </div>

            <EscalationPreview form={escalationForm} users={users} />
          </div>

          <SheetFooter className="px-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEscalationSheet(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isSaving} onClick={saveEscalation}>
              {isSaving
                ? "Saving…"
                : escalationSheet?.mode === "edit"
                  ? "Save changes"
                  : "Add escalation"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
