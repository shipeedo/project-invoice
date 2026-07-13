"use client";

import { BellRingIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { enablePushNotifications, pushSupported } from "@/lib/push-client";

/**
 * Compact "enable notifications" row for the user dropdown — a second
 * chance to opt in after dismissing the page banner. Renders nothing when
 * permission is already decided or push is unsupported.
 */
export function NotificationSetup() {
  // Client-only (mounted when the dropdown opens), so reading
  // Notification.permission in the initializer is safe.
  const [state, setState] = useState<"hidden" | "prompt" | "enabling">(() =>
    pushSupported() && Notification.permission === "default" ? "prompt" : "hidden",
  );

  async function enable() {
    setState("enabling");
    try {
      await enablePushNotifications();
    } catch (error) {
      console.error("Enabling notifications failed", error);
    } finally {
      setState("hidden");
    }
  }

  if (state === "hidden") return null;

  return (
    <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
      <p className="text-xs text-muted-foreground">
        Get notified when invoices are assigned to you.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={state === "enabling"}
        onClick={() => void enable()}
      >
        <BellRingIcon />
        {state === "enabling" ? "Enabling..." : "Enable"}
      </Button>
    </div>
  );
}
