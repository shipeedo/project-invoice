/* Service worker for web push notifications. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  console.log("[sw] push received at", new Date().toISOString());
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
    console.log("[sw] payload", data);
  } catch (error) {
    console.error("[sw] payload parse failed", error);
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration
      .showNotification(data.title || "Project Invoice", {
        body: data.body || "",
        tag: data.tag,
        data: { url: data.url || "/" },
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
      })
      .then(() => {
        console.log("[sw] showNotification resolved");
      })
      .catch((error) => {
        console.error("[sw] showNotification FAILED", error);
      }),
  );
});

self.addEventListener("pushsubscriptionchange", () => {
  // If the browser rotates the subscription, pushes to the old endpoint go
  // nowhere. Log it so this state is visible while debugging.
  console.warn("[sw] pushsubscriptionchange — subscription was rotated/expired");
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const client = clientList.find((entry) => "focus" in entry);
        if (client) {
          return client.focus().then((focused) => focused.navigate(url));
        }
        return self.clients.openWindow(url);
      }),
  );
});
