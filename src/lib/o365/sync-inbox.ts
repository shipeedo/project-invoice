import { and, count, eq } from "drizzle-orm";
import { readFile } from "fs/promises";
import {
  db,
  creditRequests,
  emailThreads,
  mailboxMessageAttachments,
  mailboxMessages,
} from "@/lib/db";
import {
  linkSupplierToThreadsAndMessages,
  resolveSupplierIdForEmail,
  upsertEmailContact,
} from "@/lib/email-contacts";
import { getValidAccessToken, updateO365Mailbox, resolveGraphMailboxUser } from "@/lib/o365/connection";
import {
  downloadFileAttachment,
  extractEmailAddresses,
  extractMessageBody,
  getFileAttachmentMetadata,
  getMessageDetails,
  listInboxMessages,
  listMessageAttachments,
  resolveGraphMailboxByAddress,
  type GraphMessage,
} from "@/lib/o365/graph";
import { processEmailInvoice } from "@/lib/o365/process-email";
import { saveBufferToUploads } from "@/lib/uploads";

type SyncConnection = {
  id: string;
  organizationId: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  microsoftTenantId: string | null;
  selectedMailboxId: string | null;
  selectedMailboxUpn: string | null;
  lastSyncedAt: Date | null;
};

export type SyncInboxResult = {
  organizationId: string;
  synced: number;
  invoicesProcessed: number;
  skipped: number;
  errors: string[];
};

function isOutboundFromMailbox(message: GraphMessage, mailboxUpn: string) {
  const from = message.from?.emailAddress?.address?.toLowerCase();
  return from === mailboxUpn.toLowerCase();
}

async function upsertThread(params: {
  organizationId: string;
  conversationId: string;
  subject?: string | null;
  lastMessageAt: Date;
  supplierId?: string | null;
}) {
  const existing = await db.query.emailThreads.findFirst({
    where: and(
      eq(emailThreads.organizationId, params.organizationId),
      eq(emailThreads.graphConversationId, params.conversationId),
    ),
  });

  if (existing) {
    const [updated] = await db
      .update(emailThreads)
      .set({
        subject: params.subject ?? existing.subject,
        supplierId: existing.supplierId ?? params.supplierId ?? null,
        lastMessageAt: params.lastMessageAt,
        updatedAt: new Date(),
      })
      .where(eq(emailThreads.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(emailThreads)
    .values({
      organizationId: params.organizationId,
      graphConversationId: params.conversationId,
      subject: params.subject ?? null,
      supplierId: params.supplierId ?? null,
      lastMessageAt: params.lastMessageAt,
    })
    .returning();

  return created;
}

async function syncMessageAttachments(params: {
  accessToken: string;
  mailbox: string;
  dbMessageId: string;
  graphMessageId: string;
}) {
  const attachmentList = await listMessageAttachments({
    accessToken: params.accessToken,
    mailbox: params.mailbox,
    messageId: params.graphMessageId,
  });

  for (const attachment of attachmentList.value) {
    if (!attachment.id) continue;
    if (attachment["@odata.type"] && !attachment["@odata.type"].includes("fileAttachment")) {
      continue;
    }

    const fileName = attachment.name ?? attachment.id;
    if (!fileName) continue;

    const existing = await db.query.mailboxMessageAttachments.findFirst({
      where: and(
        eq(mailboxMessageAttachments.messageId, params.dbMessageId),
        eq(mailboxMessageAttachments.graphAttachmentId, attachment.id),
      ),
    });

    if (existing) {
      if (existing.contentId == null) {
        const meta = await getFileAttachmentMetadata({
          accessToken: params.accessToken,
          mailbox: params.mailbox,
          messageId: params.graphMessageId,
          attachmentId: attachment.id,
        });
        await db
          .update(mailboxMessageAttachments)
          .set({
            isInline: meta.isInline ?? attachment.isInline ?? false,
            contentId: meta.contentId ?? null,
          })
          .where(eq(mailboxMessageAttachments.id, existing.id));
      }
      continue;
    }

    const downloaded = await downloadFileAttachment({
      accessToken: params.accessToken,
      mailbox: params.mailbox,
      messageId: params.graphMessageId,
      attachmentId: attachment.id,
    });

    const saved = await saveBufferToUploads({
      buffer: downloaded.buffer,
      fileName: downloaded.name,
      mimeType: downloaded.contentType,
      subdir: "email",
    });

    await db.insert(mailboxMessageAttachments).values({
      messageId: params.dbMessageId,
      graphAttachmentId: attachment.id,
      fileName: downloaded.name,
      filePath: saved.storedPath,
      mimeType: saved.mimeType,
      size: saved.size,
      isInline: downloaded.isInline,
      contentId: downloaded.contentId,
    });
  }
}

async function handleCreditThreadReply(params: {
  organizationId: string;
  threadId: string;
}) {
  const openRequests = await db.query.creditRequests.findMany({
    where: and(
      eq(creditRequests.organizationId, params.organizationId),
      eq(creditRequests.threadId, params.threadId),
    ),
  });

  for (const request of openRequests) {
    if (["SENT", "CONTESTED"].includes(request.status)) {
      await db
        .update(creditRequests)
        .set({
          status: "AWAITING_USER",
          updatedAt: new Date(),
        })
        .where(eq(creditRequests.id, request.id));
    }
  }
}

export async function syncGraphMessage(params: {
  connection: SyncConnection;
  accessToken: string;
  mailbox: string;
  mailboxUpn: string;
  summary: GraphMessage;
}) {
  const summary = params.summary;
  let message =
    summary.body?.content
      ? summary
      : await getMessageDetails({
          accessToken: params.accessToken,
          mailbox: params.mailbox,
          messageId: summary.id,
        });

  const conversationId = message.conversationId ?? message.id;
  const fromEmail = message.from?.emailAddress?.address ?? null;
  const fromName = message.from?.emailAddress?.name ?? null;
  const receivedAt = message.receivedDateTime
    ? new Date(message.receivedDateTime)
    : new Date();
  const outbound = isOutboundFromMailbox(message, params.mailboxUpn);

  let supplierId: string | null = null;
  if (!outbound && fromEmail) {
    supplierId = await resolveSupplierIdForEmail(
      params.connection.organizationId,
      fromEmail,
      fromName,
    );
    await upsertEmailContact({
      organizationId: params.connection.organizationId,
      email: fromEmail,
      displayName: fromName,
    });
  }

  const thread = await upsertThread({
    organizationId: params.connection.organizationId,
    conversationId,
    subject: message.subject,
    lastMessageAt: receivedAt,
    supplierId,
  });

  const existingMessage = await db.query.mailboxMessages.findFirst({
    where: and(
      eq(mailboxMessages.organizationId, params.connection.organizationId),
      eq(mailboxMessages.graphMessageId, message.id),
    ),
  });

  if (existingMessage) {
    let currentMessage = existingMessage;

    if (!existingMessage.bodyHtml) {
      if (!message.body?.content) {
        message = await getMessageDetails({
          accessToken: params.accessToken,
          mailbox: params.mailbox,
          messageId: summary.id,
        });
      }

      if (message.body?.content) {
        const body = extractMessageBody(message);
        const [updated] = await db
          .update(mailboxMessages)
          .set({
            bodyHtml: body.html,
            bodyText: body.text,
          })
          .where(eq(mailboxMessages.id, existingMessage.id))
          .returning();
        currentMessage = updated;
      }
    }

    if (currentMessage.hasAttachments) {
      await syncMessageAttachments({
        accessToken: params.accessToken,
        mailbox: params.mailbox,
        dbMessageId: currentMessage.id,
        graphMessageId: message.id,
      });
    }

    return { message: currentMessage, thread, isNew: false as const };
  }

  const body = extractMessageBody(message);
  const [storedMessage] = await db
    .insert(mailboxMessages)
    .values({
      organizationId: params.connection.organizationId,
      threadId: thread.id,
      graphMessageId: message.id,
      internetMessageId: message.internetMessageId ?? null,
      direction: outbound ? "OUTBOUND" : "INBOUND",
      fromEmail,
      fromName,
      toEmails: JSON.stringify(extractEmailAddresses(message.toRecipients)),
      ccEmails: JSON.stringify(extractEmailAddresses(message.ccRecipients)),
      subject: message.subject ?? null,
      bodyHtml: body.html,
      bodyText: body.text,
      receivedAt,
      supplierId,
      hasAttachments: message.hasAttachments ?? false,
    })
    .returning();

  if (message.hasAttachments) {
    await syncMessageAttachments({
      accessToken: params.accessToken,
      mailbox: params.mailbox,
      dbMessageId: storedMessage.id,
      graphMessageId: message.id,
    });
  }

  if (!outbound) {
    await handleCreditThreadReply({
      organizationId: params.connection.organizationId,
      threadId: thread.id,
    });
  }

  return { message: storedMessage, thread, isNew: true as const };
}

async function tryProcessInvoiceFromMessage(params: {
  organizationId: string;
  accessToken: string;
  mailbox: string;
  message: GraphMessage;
  dbMessageId: string;
}) {
  if (!params.message.hasAttachments) {
    return { skipped: true as const, reason: "no_attachments" as const };
  }

  const attachmentList = await listMessageAttachments({
    accessToken: params.accessToken,
    mailbox: params.mailbox,
    messageId: params.message.id,
  });

  const attachments = [];
  for (const attachment of attachmentList.value) {
    if (!attachment.id || !attachment.name) continue;
    const downloaded = await downloadFileAttachment({
      accessToken: params.accessToken,
      mailbox: params.mailbox,
      messageId: params.message.id,
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
    organizationId: params.organizationId,
    message: params.message,
    attachments,
  });

  if (!outcome.skipped && outcome.invoice) {
    await db
      .update(mailboxMessages)
      .set({ invoiceId: outcome.invoice.id })
      .where(eq(mailboxMessages.id, params.dbMessageId));
  }

  return outcome;
}

export async function syncOrganizationInbox(connection: SyncConnection) {
  const result: SyncInboxResult = {
    organizationId: connection.organizationId,
    synced: 0,
    invoicesProcessed: 0,
    skipped: 0,
    errors: [],
  };

  if (!connection.selectedMailboxUpn) {
    result.errors.push("No mailbox selected");
    return result;
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    let graphMailbox = resolveGraphMailboxUser(connection);

    if (!connection.selectedMailboxId && connection.selectedMailboxUpn) {
      const resolved = await resolveGraphMailboxByAddress(
        accessToken,
        connection.selectedMailboxUpn,
      );
      graphMailbox = resolved.id;
      await updateO365Mailbox({
        organizationId: connection.organizationId,
        mailboxId: resolved.id,
        mailboxUpn: connection.selectedMailboxUpn,
      });
    }

    const [{ messageCount }] = await db
      .select({ messageCount: count() })
      .from(mailboxMessages)
      .where(eq(mailboxMessages.organizationId, connection.organizationId));

    const hasSyncedBefore = messageCount > 0;
    const since =
      hasSyncedBefore && connection.lastSyncedAt
        ? new Date(connection.lastSyncedAt.getTime() - 5 * 60 * 1000)
        : null;

    const messages = await listInboxMessages({
      accessToken,
      mailbox: graphMailbox!,
      mailboxUpn: connection.selectedMailboxUpn,
      since,
      top: hasSyncedBefore ? 50 : 100,
    });

    if (messages.value.length === 0 && !hasSyncedBefore) {
      result.errors.push(
        "No inbox messages returned from Microsoft Graph — verify the shared mailbox has mail and you have Full Access in Exchange",
      );
      return result;
    }

    for (const summary of messages.value) {
      try {
        const synced = await syncGraphMessage({
          connection,
          accessToken,
          mailbox: graphMailbox!,
          mailboxUpn: connection.selectedMailboxUpn,
          summary,
        });

        if (synced.isNew) {
          result.synced += 1;
        } else {
          result.skipped += 1;
        }

        if (
          synced.isNew &&
          !isOutboundFromMailbox(summary, connection.selectedMailboxUpn) &&
          summary.hasAttachments &&
          synced.thread.supplierId
        ) {
          const invoiceOutcome = await tryProcessInvoiceFromMessage({
            organizationId: connection.organizationId,
            accessToken,
            mailbox: graphMailbox!,
            message: summary,
            dbMessageId: synced.message.id,
          });

          if (!invoiceOutcome.skipped) {
            result.invoicesProcessed += 1;
          }
        }
      } catch (error) {
        result.errors.push(
          error instanceof Error ? error.message : "Failed to sync message",
        );
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Sync failed");
  }

  return result;
}

export async function loadAttachmentBytes(filePath: string) {
  return readFile(filePath);
}

export { linkSupplierToThreadsAndMessages };
