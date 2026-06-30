"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type InvoiceActionsProps = {
  invoiceId: string;
  status: string;
};

export function InvoiceActions({ invoiceId, status }: InvoiceActionsProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function runAction(action: "approve" | "reject" | "ready") {
    setLoading(action);
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });

    setLoading(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Action failed");
      return;
    }

    router.refresh();
  }

  const canApprove = ["PENDING_APPROVAL", "NEEDS_REVIEW"].includes(status);
  const canReject = ["PENDING_APPROVAL", "NEEDS_REVIEW", "APPROVED"].includes(status);
  const canMarkReady = status === "APPROVED";

  if (!canApprove && !canReject && !canMarkReady) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold">Approval actions</h3>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional note for the audit trail"
        className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {canApprove ? (
          <button
            type="button"
            onClick={() => runAction("approve")}
            disabled={loading !== null}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            {loading === "approve" ? "Approving..." : "Approve"}
          </button>
        ) : null}
        {canReject ? (
          <button
            type="button"
            onClick={() => runAction("reject")}
            disabled={loading !== null}
            className="rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-60"
          >
            {loading === "reject" ? "Rejecting..." : "Reject"}
          </button>
        ) : null}
        {canMarkReady ? (
          <button
            type="button"
            onClick={() => runAction("ready")}
            disabled={loading !== null}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading === "ready" ? "Updating..." : "Mark ready for payment"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
