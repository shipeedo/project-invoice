"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Records that the accounts team has sent the credit to the carrier. The
 * sending itself happens outside the app, so this is a manual mark.
 */
export function CreditSubmitButton({ creditRequestId }: { creditRequestId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);

    const response = await fetch(`/api/credit-requests/${creditRequestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit" }),
    });

    setLoading(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to mark as submitted");
      return;
    }

    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => void handleClick()}
      disabled={loading}
      title={error ?? "Mark this credit as sent to the carrier"}
      aria-invalid={error ? true : undefined}
    >
      {loading ? "Saving..." : "Mark submitted"}
    </Button>
  );
}
