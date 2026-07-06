import { pollAllO365Mailboxes } from "@/lib/o365/poll";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startBackgroundO365Poller() {
  if (intervalHandle) return;

  intervalHandle = setInterval(() => {
    void pollAllO365Mailboxes({ triggeredBy: "background" }).catch((error) => {
      console.error("[o365] Background mailbox poll failed:", error);
    });
  }, POLL_INTERVAL_MS);

  if (typeof intervalHandle === "object" && "unref" in intervalHandle) {
    intervalHandle.unref();
  }
}
