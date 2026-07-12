export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.DISABLE_BACKGROUND_O365_POLL !== "true") {
    const { startBackgroundO365Poller } = await import("@/lib/o365/background-poller");
    startBackgroundO365Poller();
  }

  if (process.env.DISABLE_BACKGROUND_QUEUE_WORKER !== "true") {
    const { startBackgroundQueueWorker } = await import(
      "@/lib/processing-queue-poller"
    );
    startBackgroundQueueWorker();
  }
}
