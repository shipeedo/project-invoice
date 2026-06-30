import { eq } from "drizzle-orm";
import { db, o365Connections } from "@/lib/db";
import {
  getO365Connection,
  markO365ConnectionError,
} from "@/lib/o365/connection";
import { syncOrganizationInbox, type SyncInboxResult } from "@/lib/o365/sync-inbox";

export type PollResult = SyncInboxResult & {
  processed: number;
};

function toPollResult(sync: SyncInboxResult): PollResult {
  return {
    ...sync,
    processed: sync.invoicesProcessed,
  };
}

async function pollOrganizationConnection(connection: {
  id: string;
  organizationId: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  microsoftTenantId: string | null;
  selectedMailboxUpn: string | null;
  lastSyncedAt: Date | null;
}) {
  const result = await syncOrganizationInbox(connection);

  await db
    .update(o365Connections)
    .set({
      lastSyncedAt: new Date(),
      status: result.errors.length > 0 ? "ERROR" : "CONNECTED",
      lastError: result.errors.length > 0 ? result.errors.join("; ") : null,
      updatedAt: new Date(),
    })
    .where(eq(o365Connections.id, connection.id));

  if (result.errors.length > 0 && result.synced === 0) {
    await markO365ConnectionError(
      connection.organizationId,
      result.errors.join("; "),
    );
  }

  return toPollResult(result);
}

export async function pollAllO365Mailboxes() {
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
    results.push(await pollOrganizationConnection(connection));
  }

  return results;
}

export async function pollOrganizationMailbox(organizationId: string) {
  const connection = await getO365Connection(organizationId);
  if (!connection || connection.status !== "CONNECTED") {
    return {
      organizationId,
      synced: 0,
      invoicesProcessed: 0,
      processed: 0,
      skipped: 0,
      errors: ["O365 is not connected"],
    } satisfies PollResult;
  }

  return pollOrganizationConnection(connection);
}
