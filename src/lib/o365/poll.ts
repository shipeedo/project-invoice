import { eq } from "drizzle-orm";
import { db, o365Connections } from "@/lib/db";
import {
  getO365Connection,
  getValidAccessToken,
  markO365ConnectionError,
} from "@/lib/o365/connection";
import {
  downloadFileAttachment,
  getMessageDetails,
  listInboxMessages,
  listMessageAttachments,
} from "@/lib/o365/graph";
import { processEmailInvoice } from "@/lib/o365/process-email";

export type PollResult = {
  organizationId: string;
  processed: number;
  skipped: number;
  errors: string[];
};

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
  const result: PollResult = {
    organizationId: connection.organizationId,
    processed: 0,
    skipped: 0,
    errors: [],
  };

  if (!connection.selectedMailboxUpn) {
    result.errors.push("No mailbox selected");
    return result;
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const since = connection.lastSyncedAt
      ? new Date(connection.lastSyncedAt.getTime() - 5 * 60 * 1000)
      : null;

    const messages = await listInboxMessages({
      accessToken,
      mailboxUpn: connection.selectedMailboxUpn,
      since,
      top: 25,
    });

    for (const summary of messages.value) {
      if (!summary.hasAttachments) {
        result.skipped += 1;
        continue;
      }

      try {
        const message = await getMessageDetails({
          accessToken,
          mailboxUpn: connection.selectedMailboxUpn,
          messageId: summary.id,
        });

        const attachmentList = await listMessageAttachments({
          accessToken,
          mailboxUpn: connection.selectedMailboxUpn,
          messageId: summary.id,
        });

        const fileAttachments = attachmentList.value.filter(
          (attachment) =>
            attachment["@odata.type"] === "#microsoft.graph.fileAttachment" ||
            !attachment["@odata.type"],
        );

        const attachments = [];
        for (const attachment of fileAttachments) {
          if (!attachment.id || !attachment.name) continue;
          const downloaded = await downloadFileAttachment({
            accessToken,
            mailboxUpn: connection.selectedMailboxUpn,
            messageId: summary.id,
            attachmentId: attachment.id,
          });
          attachments.push({
            fileName: downloaded.name,
            mimeType: downloaded.contentType,
            size: downloaded.size,
            buffer: downloaded.buffer,
          });
        }

        const outcome = await processEmailInvoice({
          organizationId: connection.organizationId,
          message,
          attachments,
        });

        if (outcome.skipped) {
          result.skipped += 1;
        } else {
          result.processed += 1;
        }
      } catch (error) {
        result.errors.push(
          error instanceof Error ? error.message : "Failed to process message",
        );
      }
    }

    await db
      .update(o365Connections)
      .set({
        lastSyncedAt: new Date(),
        status: "CONNECTED",
        lastError: result.errors.length > 0 ? result.errors.join("; ") : null,
        updatedAt: new Date(),
      })
      .where(eq(o365Connections.id, connection.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Polling failed";
    await markO365ConnectionError(connection.organizationId, message);
    result.errors.push(message);
  }

  return result;
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
      processed: 0,
      skipped: 0,
      errors: ["O365 is not connected"],
    } satisfies PollResult;
  }

  return pollOrganizationConnection(connection);
}
