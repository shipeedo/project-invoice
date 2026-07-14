import { eq } from "drizzle-orm";
import { db, o365Connections } from "@/lib/db";
import {
  getO365Connection,
  markO365ConnectionError,
} from "@/lib/o365/connection";
import { syncOrganizationInbox, type SyncInboxResult } from "@/lib/o365/sync-inbox";
import type { SyncProgressEvent } from "@/lib/o365/sync-events";

export type PollResult = SyncInboxResult & {
  queued: number;
  pollSkipped?: boolean;
};

function toPollResult(sync: SyncInboxResult, pollSkipped = false): PollResult {
  return {
    ...sync,
    queued: sync.invoicesQueued,
    pollSkipped,
  };
}

let pollInProgress = false;

export function isO365PollInProgress() {
  return pollInProgress;
}

async function pollOrganizationConnection(
  connection: {
    id: string;
    organizationId: string;
    accessTokenEncrypted: string | null;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
    microsoftTenantId: string | null;
    selectedMailboxId: string | null;
    selectedMailboxUpn: string | null;
    lastSyncedAt: Date | null;
  },
  options?: { onProgress?: (event: SyncProgressEvent) => void },
) {
  const result = await syncOrganizationInbox(connection, options);

  const processedMessages = result.synced > 0 || result.skipped > 0;
  const shouldAdvanceSyncCursor = processedMessages;
  const warningSummary =
    result.errors.length > 0
      ? result.errors.length <= 3
        ? result.errors.join("; ")
        : `${result.errors.slice(0, 3).join("; ")} (+${result.errors.length - 3} more)`
      : null;

  await db
    .update(o365Connections)
    .set({
      lastSyncedAt: shouldAdvanceSyncCursor ? new Date() : connection.lastSyncedAt,
      status: result.fatal ? "ERROR" : "CONNECTED",
      lastError: result.fatal ? warningSummary : processedMessages ? null : warningSummary,
      updatedAt: new Date(),
    })
    .where(eq(o365Connections.id, connection.id));

  if (result.fatal) {
    await markO365ConnectionError(
      connection.organizationId,
      result.errors.join("; "),
    );
  }

  return toPollResult(result);
}

export async function pollAllO365Mailboxes(options?: {
  onProgress?: (event: SyncProgressEvent) => void;
  triggeredBy?: "sync" | "manual" | "background" | "cron";
}) {
  if (pollInProgress) {
    return [toPollResult({
      organizationId: "all",
      synced: 0,
      invoicesQueued: 0,
      skipped: 0,
      errors: ["Mailbox sync already in progress"],
      fatal: false,
    }, true)];
  }

  pollInProgress = true;

  try {
    const connections = await db.query.o365Connections.findMany({
      where: eq(o365Connections.status, "CONNECTED"),
    });

    const activeConnections = connections.filter(
      (connection) =>
        connection.selectedMailboxUpn &&
        connection.accessTokenEncrypted &&
        connection.refreshTokenEncrypted,
    );

    const results: PollResult[] = [];
    for (const connection of activeConnections) {
      results.push(await pollOrganizationConnection(connection, options));
    }

    return results;
  } finally {
    pollInProgress = false;
  }
}

export async function pollOrganizationMailbox(
  organizationId: string,
  options?: { onProgress?: (event: SyncProgressEvent) => void },
) {
  if (pollInProgress) {
    return {
      organizationId,
      synced: 0,
      invoicesQueued: 0,
      queued: 0,
      skipped: 0,
      errors: ["Mailbox sync already in progress"],
      fatal: false,
      pollSkipped: true,
    } satisfies PollResult;
  }

  const connection = await getO365Connection(organizationId);
  if (
    !connection ||
    connection.status === "DISCONNECTED" ||
    !connection.accessTokenEncrypted
  ) {
    return {
      organizationId,
      synced: 0,
      invoicesQueued: 0,
      queued: 0,
      skipped: 0,
      errors: ["O365 is not connected"],
      fatal: true,
    } satisfies PollResult;
  }

  pollInProgress = true;

  try {
    return await pollOrganizationConnection(connection, options);
  } finally {
    pollInProgress = false;
  }
}
