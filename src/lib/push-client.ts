"use client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function registerPushServiceWorker() {
  navigator.serviceWorker.register("/sw.js").catch((error) => {
    console.error("Service worker registration failed", error);
  });
}

/** Create (or reuse) this browser's push subscription and save it server-side. */
export async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const response = await fetch("/api/notifications/public-key");
    if (!response.ok) return false;
    const { publicKey } = (await response.json()) as { publicKey: string };
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const saved = await fetch("/api/notifications/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return saved.ok;
}

/** Request permission (must be called from a user gesture) and subscribe. */
export async function enablePushNotifications() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  return subscribeToPush();
}

export const BANNER_DISMISSED_KEY = "notification-banner-dismissed";

/**
 * Debug helper: tear down this browser's push state so the opt-in flow can
 * be re-tested from scratch — deletes the backend subscription row (while
 * the endpoint is still known), unsubscribes, unregisters the service
 * worker, and un-dismisses the banner. The site's notification *permission*
 * cannot be reset from JS; the caller must do that in the browser UI.
 */
export async function resetPushState() {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await fetch("/api/notifications/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe();
  }
  await registration?.unregister();
  window.localStorage.removeItem(BANNER_DISMISSED_KEY);
}
