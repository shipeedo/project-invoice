import { and, count, eq, isNull } from "drizzle-orm";
import { readFile } from "fs/promises";
import {
  db,
  creditRequests,
  emailThreads,
  mailboxMessageAttachments,
  mailboxMessages,
} from "@/lib/db";
import {
  applySupplierLinkToMessage,
  linkSupplierToThreadsAndMessages,
  resolveSupplierIdFromInboundMessage,
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
import {
  enqueuePendingInboundMessages,
  kickProcessingQueue,
} from "@/lib/processing-queue";
import type { SyncProgressEvent } from "@/lib/o365/sync-events";
import { getUploadAbsolutePath, saveBufferToUploads } from "@/lib/uploads";

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
  /** Messages handed to the processing queue this sync (not processed inline). */
  invoicesQueued: number;
  skipped: number;
  errors: string[];
  /** True when the sync could not run at all (auth, mailbox, connection). */
  fatal: boolean;
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
    try {
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
        const isInline = attachment.isInline ?? existing.isInline ?? false;
        const updates: {
          isInline?: boolean;
          contentId?: string | null;
        } = {};

        if (existing.isInline !== isInline) {
          updates.isInline = isInline;
        }

        if (existing.contentId == null && isInline) {
          const meta = await getFileAttachmentMetadata({
            accessToken: params.accessToken,
            mailbox: params.mailbox,
            messageId: params.graphMessageId,
            attachmentId: attachment.id,
          });
          updates.isInline = meta.isInline ?? isInline;
          updates.contentId = meta.contentId ?? null;
        }

        if (Object.keys(updates).length > 0) {
          await db
            .update(mailboxMessageAttachments)
            .set(updates)
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
    } catch {
      // Skip individual attachment failures so one bad file does not fail the message.
    }
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
  const body = extractMessageBody(message);

  let supplierId: string | null = null;
  if (!outbound && fromEmail) {
    supplierId = await resolveSupplierIdFromInboundMessage({
      organizationId: params.connection.organizationId,
      fromEmail,
      fromName,
      subject: message.subject,
      bodyHtml: body.html,
      bodyText: body.text,
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
        const refreshedBody = extractMessageBody(message);
        const [updated] = await db
          .update(mailboxMessages)
          .set({
            bodyHtml: refreshedBody.html,
            bodyText: refreshedBody.text,
          })
          .where(eq(mailboxMessages.id, existingMessage.id))
          .returning();
        currentMessage = updated;
      }
    }

    if (!outbound && currentMessage.fromEmail) {
      const resolvedSupplierId = await applySupplierLinkToMessage({
        organizationId: params.connection.organizationId,
        messageId: currentMessage.id,
        threadId: thread.id,
        fromEmail: currentMessage.fromEmail,
        fromName: currentMessage.fromName,
        subject: currentMessage.subject,
        bodyHtml: currentMessage.bodyHtml,
        bodyText: currentMessage.bodyText,
        currentSupplierId: currentMessage.supplierId,
      });

      if (resolvedSupplierId && resolvedSupplierId !== currentMessage.supplierId) {
        currentMessage = { ...currentMessage, supplierId: resolvedSupplierId };
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

async function backfillInboundMessageSuppliers(organizationId: string) {
  const messages = await db.query.mailboxMessages.findMany({
    where: and(
      eq(mailboxMessages.organizationId, organizationId),
      eq(mailboxMessages.direction, "INBOUND"),
      isNull(mailboxMessages.supplierId),
    ),
  });

  for (const message of messages) {
    if (!message.bodyHtml && !message.bodyText) continue;
    if (!message.fromEmail) continue;

    await applySupplierLinkToMessage({
      organizationId,
      messageId: message.id,
      threadId: message.threadId,
      fromEmail: message.fromEmail,
      fromName: message.fromName,
      subject: message.subject,
      bodyHtml: message.bodyHtml,
      bodyText: message.bodyText,
      currentSupplierId: message.supplierId,
    });
  }
}

export async function syncOrganizationInbox(
  connection: SyncConnection,
  options?: { onProgress?: (event: SyncProgressEvent) => void },
) {
  const report = options?.onProgress;
  const result: SyncInboxResult = {
    organizationId: connection.organizationId,
    synced: 0,
    invoicesQueued: 0,
    skipped: 0,
    errors: [],
    fatal: false,
  };

  if (!connection.selectedMailboxUpn) {
    result.errors.push("No mailbox selected");
    result.fatal = true;
    return result;
  }

  try {
    report?.({ type: "status", message: "Connecting to mailbox…" });
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

    report?.({ type: "status", message: "Fetching inbox messages…" });
    const messages = await listInboxMessages({
      accessToken,
      mailbox: graphMailbox!,
      mailboxUpn: connection.selectedMailboxUpn,
      since,
      top: hasSyncedBefore ? 50 : 100,
    });

    const total = messages.value.length;

    if (total === 0 && !hasSyncedBefore) {
      result.errors.push(
        "No inbox messages returned from Microsoft Graph — verify the shared mailbox has mail and you have Full Access in Exchange",
      );
      result.fatal = true;
      return result;
    }

    if (total === 0) {
      report?.({ type: "status", message: "No new messages to sync." });
    }

    for (let index = 0; index < messages.value.length; index++) {
      const summary = messages.value[index];
      const current = index + 1;
      report?.({
        type: "progress",
        current,
        total,
        message: `Downloading message ${current}/${total}`,
        subject: summary.subject ?? undefined,
      });

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
      } catch (error) {
        result.errors.push(
          error instanceof Error ? error.message : "Failed to sync message",
        );
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Sync failed");
    result.fatal = true;
  }

  if (!result.fatal) {
    try {
      report?.({ type: "status", message: "Re-evaluating forwarded message suppliers…" });
      await backfillInboundMessageSuppliers(connection.organizationId);
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : "Supplier backfill failed",
      );
    }

    try {
      report?.({ type: "status", message: "Queueing invoice emails for processing…" });
      // Processing runs through the queue (LLM classification + extraction),
      // never inline — a burst of inbound mail must not fan out into a burst
      // of AI calls.
      result.invoicesQueued = await enqueuePendingInboundMessages(
        connection.organizationId,
      );
      kickProcessingQueue();
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : "Queueing invoice emails failed",
      );
    }
  }

  return result;
}

export async function loadAttachmentBytes(filePath: string) {
  return readFile(getUploadAbsolutePath(filePath));
}

export { linkSupplierToThreadsAndMessages };
