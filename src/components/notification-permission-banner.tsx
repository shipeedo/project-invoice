"use client";

import { BellRingIcon, XIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  BANNER_DISMISSED_KEY as DISMISSED_KEY,
  enablePushNotifications,
  pushSupported,
  registerPushServiceWorker,
  subscribeToPush,
} from "@/lib/push-client";

function subscribeNoop() {
  return () => {};
}

function getPermissionSnapshot() {
  return pushSupported() ? Notification.permission : "unsupported";
}

/**
 * Prominent, dismissible banner asking the user to enable browser
 * notifications, shown on every page while permission is undecided.
 * Also owns service-worker registration and re-saving the push
 * subscription on each visit once permission is granted.
 */
export function NotificationPermissionBanner() {
  // "unsupported" on the server so SSR and hydration render nothing.
  const permission = useSyncExternalStore(
    subscribeNoop,
    getPermissionSnapshot,
    () => "unsupported",
  );
  const [dismissed, setDismissed] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    registerPushServiceWorker();
    if (Notification.permission === "granted") {
      // Self-heal: re-create and re-save the subscription on every visit.
      void subscribeToPush().catch(() => undefined);
    }
  }, []);

  const storedDismissal = useSyncExternalStore(
    subscribeNoop,
    () => window.localStorage.getItem(DISMISSED_KEY) === "true",
    () => true,
  );

  if (permission !== "default" || dismissed || storedDismissal) {
    return null;
  }

  async function enable() {
    setEnabling(true);
    try {
      await enablePushNotifications();
    } catch (error) {
      console.error("Enabling notifications failed", error);
    } finally {
      // Re-render picks up the new Notification.permission snapshot.
      setEnabling(false);
      setDismissed(true);
    }
  }

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="mx-4 mb-4 flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      <BellRingIcon className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Enable browser notifications</p>
        <p className="text-xs text-muted-foreground">
          Get notified when an invoice is assigned to you or someone sends you a
          reminder — even when this tab is closed.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={() => void enable()}
        disabled={enabling}
      >
        {enabling ? "Enabling..." : "Enable notifications"}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={dismiss}
        aria-label="Dismiss notification prompt"
      >
        <XIcon />
      </Button>
    </div>
  );
}
