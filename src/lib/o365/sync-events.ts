import type { PollResult } from "@/lib/o365/poll";

export type SyncProgressEvent =
  | { type: "status"; message: string }
  | {
      type: "progress";
      current: number;
      total: number;
      message: string;
      subject?: string;
    }
  | { type: "complete"; result: PollResult }
  | { type: "error"; message: string };

export function encodeSyncProgressEvent(event: SyncProgressEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}
