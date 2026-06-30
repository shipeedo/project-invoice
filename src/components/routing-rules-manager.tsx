"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export function RoutingRulesManager({ initialRules, users }: RoutingRulesManagerProps) {
  const [rules, setRules] = useState(initialRules);
  const [error, setError] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState("SENDER_EMAIL");
  const [approverId, setApproverId] = useState("");

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

    setRules(await response.json());
  }

  async function createRule(formData: FormData) {
    const type = String(formData.get("type"));
    const condition: Record<string, unknown> = {};

    if (type === "SENDER_EMAIL") {
      const senderEmail = String(formData.get("senderEmail") ?? "").trim();
      const senderDomain = String(formData.get("senderDomain") ?? "").trim();
      if (senderEmail) condition.senderEmail = senderEmail;
      if (senderDomain) condition.senderDomain = senderDomain;
    } else if (type === "AMOUNT_THRESHOLD") {
      condition.minAmount = Number(formData.get("minAmount"));
    } else if (type === "PARSE_FAILURE") {
      condition.parseFailure = true;
    }

    const response = await fetch("/api/admin/routing-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name")),
        priority: Number(formData.get("priority") ?? 10),
        type,
        condition,
        approverId: String(formData.get("approverId")),
        isDefault: type === "DEFAULT",
      }),
    });

    if (!response.ok) {
      setError("Failed to create rule");
      return;
    }

    await refreshRules();
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
          <CardTitle>Active rules (higher priority first)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead className="w-28">Reorder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule, index) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <p className="font-medium">
                      {rule.name}{" "}
                      {rule.isDefault ? (
                        <span className="text-muted-foreground">(404 default)</span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Priority {rule.priority} · {rule.type} · Approver:{" "}
                      {rule.approver?.name ?? rule.approver?.email ?? "None"}
                    </p>
                    <p className="text-xs text-muted-foreground">{rule.condition}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add routing rule</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              await createRule(formData);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="name">Rule name</Label>
              <Input id="name" name="name" required placeholder="Rule name" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Rule type</Label>
              <Select value={ruleType} onValueChange={(value) => value && setRuleType(value)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SENDER_EMAIL">Sender email / domain</SelectItem>
                  <SelectItem value="AMOUNT_THRESHOLD">Amount threshold</SelectItem>
                  <SelectItem value="PARSE_FAILURE">Parse failure</SelectItem>
                  <SelectItem value="DEFAULT">Default (404)</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" name="type" value={ruleType} />
            </div>

            <Input name="senderEmail" placeholder="Sender email (optional)" />
            <Input name="senderDomain" placeholder="Sender domain (optional)" />
            <Input name="minAmount" type="number" placeholder="Minimum amount" />
            <Input name="priority" type="number" defaultValue={20} />

            <div className="space-y-2">
              <Label htmlFor="approverId">Approver</Label>
              <Select value={approverId} onValueChange={(value) => value && setApproverId(value)}>
                <SelectTrigger id="approverId">
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
              <input type="hidden" name="approverId" value={approverId} required />
            </div>

            <Button type="submit">Create rule</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
