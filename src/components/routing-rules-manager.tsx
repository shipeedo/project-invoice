"use client";

import { useState } from "react";

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
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="font-medium">Active rules (higher priority first)</h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {rules.map((rule, index) => (
            <li key={rule.id} className="flex items-center justify-between gap-4 px-4 py-4 text-sm">
              <div>
                <p className="font-medium">
                  {rule.name} {rule.isDefault ? <span className="text-slate-500">(404 default)</span> : null}
                </p>
                <p className="text-slate-500">
                  Priority {rule.priority} · {rule.type} · Approver:{" "}
                  {rule.approver?.name ?? rule.approver?.email ?? "None"}
                </p>
                <p className="text-xs text-slate-400">{rule.condition}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => moveRule(rule.id, "up")}
                  disabled={index === 0}
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveRule(rule.id, "down")}
                  disabled={index === rules.length - 1}
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <form
        action={async (formData) => {
          await createRule(formData);
        }}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h3 className="font-medium">Add routing rule</h3>
        <input name="name" required placeholder="Rule name" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select name="type" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="SENDER_EMAIL">Sender email / domain</option>
          <option value="AMOUNT_THRESHOLD">Amount threshold</option>
          <option value="PARSE_FAILURE">Parse failure</option>
          <option value="DEFAULT">Default (404)</option>
        </select>
        <input name="senderEmail" placeholder="Sender email (optional)" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="senderDomain" placeholder="Sender domain (optional)" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="minAmount" type="number" placeholder="Minimum amount" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="priority" type="number" defaultValue={20} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select name="approverId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Select approver</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name ?? user.email} ({user.email})
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Create rule
        </button>
      </form>
    </div>
  );
}
