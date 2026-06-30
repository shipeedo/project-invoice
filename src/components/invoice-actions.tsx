"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type InvoiceActionsProps = {
  invoiceId: string;
  status: string;
  validatedAt?: Date | string | null;
};

export function InvoiceActions({ invoiceId, status, validatedAt }: InvoiceActionsProps) {
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

  const canApprove =
    ["PENDING_APPROVAL", "NEEDS_REVIEW"].includes(status) && Boolean(validatedAt);
  const canReject = ["PENDING_APPROVAL", "NEEDS_REVIEW", "APPROVED"].includes(status);
  const canMarkReady = status === "APPROVED";

  if (!canApprove && !canReject && !canMarkReady) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note for the audit trail"
        />
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canApprove ? (
            <Button
              type="button"
              onClick={() => runAction("approve")}
              disabled={loading !== null}
            >
              {loading === "approve" ? "Approving..." : "Approve"}
            </Button>
          ) : null}
          {canReject ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => runAction("reject")}
              disabled={loading !== null}
            >
              {loading === "reject" ? "Rejecting..." : "Reject"}
            </Button>
          ) : null}
          {canMarkReady ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => runAction("ready")}
              disabled={loading !== null}
            >
              {loading === "ready" ? "Updating..." : "Mark ready for payment"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
