import { runProcessingQueue } from "@/lib/processing-queue";

const QUEUE_POLL_INTERVAL_MS = 60 * 1000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Periodically drains the processing queue so retried and stale jobs make
 * progress even when no sync is running. Overlap-safe: runProcessingQueue
 * returns immediately when a drain is already in flight.
 */
export function startBackgroundQueueWorker() {
  if (intervalHandle) return;

  intervalHandle = setInterval(() => {
    void runProcessingQueue().catch((error) => {
      console.error("[processing-queue] Background run failed:", error);
    });
  }, QUEUE_POLL_INTERVAL_MS);

  if (typeof intervalHandle === "object" && "unref" in intervalHandle) {
    intervalHandle.unref();
  }
}
