export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_BACKGROUND_O365_POLL === "true") return;

  const { startBackgroundO365Poller } = await import("@/lib/o365/background-poller");
  startBackgroundO365Poller();
}
