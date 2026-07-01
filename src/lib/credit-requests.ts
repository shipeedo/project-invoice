import { and, eq } from "drizzle-orm";
import { readFile } from "fs/promises";
import { recordAuditEvent } from "@/lib/audit";
import {
  createSupplierFromEmailContact,
  linkSupplierToThreadsAndMessages,
} from "@/lib/email-contacts";
import {
  creditRequests,
  db,
  emailThreads,
  invoices,
  mailboxMessages,
} from "@/lib/db";
import type { CarrierDecision, CreditRequestStatus } from "@/lib/db/types";
import { getO365Connection, getValidAccessToken, resolveGraphMailboxUser } from "@/lib/o365/connection";
import {
  getMessageDetails,
  listInboxMessages,
  replyToMessage,
  sendMail,
  type SendMailAttachment,
} from "@/lib/o365/graph";
import { syncGraphMessage } from "@/lib/o365/sync-inbox";
import { getUploadAbsolutePath } from "@/lib/uploads";

type AttachmentInput = { name: string; path: string; mimeType: string };

async function toGraphAttachments(
  attachments: AttachmentInput[],
): Promise<SendMailAttachment[]> {
  const result: SendMailAttachment[] = [];
  for (const attachment of attachments) {
    const buffer = await readFile(getUploadAbsolutePath(attachment.path));
    result.push({
      name: attachment.name,
      contentType: attachment.mimeType,
      contentBytes: buffer.toString("base64"),
    });
  }
  return result;
}

async function findSentMessage(params: {
  accessToken: string;
  mailbox: string;
  mailboxUpn: string;
  subject: string;
  since: Date;
}) {
  const messages = await listInboxMessages({
    accessToken: params.accessToken,
    mailbox: params.mailbox,
    mailboxUpn: params.mailboxUpn,
    since: params.since,
    top: 10,
  });

  return (
    messages.value.find(
      (message) =>
        message.subject === params.subject &&
        message.from?.emailAddress?.address?.toLowerCase() ===
          params.mailboxUpn.toLowerCase(),
    ) ?? null
  );
}

export async function createAndSendCreditRequest(params: {
  organizationId: string;
  userId: string;
  invoiceId: string;
  subject: string;
  message: string;
  recipientEmail: string;
  attachments?: AttachmentInput[];
}) {
  const connection = await getO365Connection(params.organizationId);
  if (!connection?.selectedMailboxUpn || connection.status !== "CONNECTED") {
    return { error: "Office 365 mailbox is not connected" as const };
  }

  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, params.invoiceId),
      eq(invoices.organizationId, params.organizationId),
    ),
  });
  if (!invoice) {
    return { error: "Invoice not found" as const };
  }

  const accessToken = await getValidAccessToken(connection);
  const graphMailbox = resolveGraphMailboxUser(connection)!;
  const graphAttachments = params.attachments?.length
    ? await toGraphAttachments(params.attachments)
    : undefined;

  const bodyHtml = params.message.replace(/\n/g, "<br/>");
  const sentAt = new Date();

  await sendMail({
    accessToken,
    mailbox: graphMailbox,
    subject: params.subject,
    bodyHtml,
    to: [params.recipientEmail],
    attachments: graphAttachments,
  });

  const sentSummary = await findSentMessage({
    accessToken,
    mailbox: graphMailbox,
    mailboxUpn: connection.selectedMailboxUpn,
    subject: params.subject,
    since: sentAt,
  });

  let threadId: string | null = null;
  let rootMessageId: string | null = null;

  if (sentSummary?.conversationId) {
    const synced = await syncGraphMessage({
      connection,
      accessToken,
      mailbox: graphMailbox,
      mailboxUpn: connection.selectedMailboxUpn,
      summary: sentSummary,
    });
    threadId = synced.thread.id;
    rootMessageId = synced.message.id;
  } else if (sentSummary) {
    const details = await getMessageDetails({
      accessToken,
      mailbox: graphMailbox,
      messageId: sentSummary.id,
    });
    const synced = await syncGraphMessage({
      connection,
      accessToken,
      mailbox: graphMailbox,
      mailboxUpn: connection.selectedMailboxUpn,
      summary: details,
    });
    threadId = synced.thread.id;
    rootMessageId = synced.message.id;
  }

  const [creditRequest] = await db
    .insert(creditRequests)
    .values({
      organizationId: params.organizationId,
      invoiceId: params.invoiceId,
      threadId,
      createdById: params.userId,
      status: "SENT",
      subject: params.subject,
      recipientEmail: params.recipientEmail,
      message: params.message,
      attachments: JSON.stringify(params.attachments ?? []),
      rootMessageId,
    })
    .returning();

  await recordAuditEvent({
    invoiceId: params.invoiceId,
    userId: params.userId,
    action: "credit_request.sent",
    details: {
      creditRequestId: creditRequest.id,
      threadId,
      recipientEmail: params.recipientEmail,
    },
  });

  return { creditRequest };
}

export async function sendThreadReply(params: {
  organizationId: string;
  userId: string;
  threadId: string;
  message: string;
  attachments?: AttachmentInput[];
}) {
  const connection = await getO365Connection(params.organizationId);
  if (!connection?.selectedMailboxUpn || connection.status !== "CONNECTED") {
    return { error: "Office 365 mailbox is not connected" as const };
  }

  const thread = await db.query.emailThreads.findFirst({
    where: and(
      eq(emailThreads.id, params.threadId),
      eq(emailThreads.organizationId, params.organizationId),
    ),
    with: {
      messages: {
        orderBy: (table, { desc }) => [desc(table.receivedAt)],
        limit: 1,
      },
    },
  });

  if (!thread?.messages[0]) {
    return { error: "Thread has no messages to reply to" as const };
  }

  const accessToken = await getValidAccessToken(connection);
  const graphMailbox = resolveGraphMailboxUser(connection)!;
  const graphAttachments = params.attachments?.length
    ? await toGraphAttachments(params.attachments)
    : undefined;

  await replyToMessage({
    accessToken,
    mailbox: graphMailbox,
    messageId: thread.messages[0].graphMessageId,
    bodyHtml: params.message.replace(/\n/g, "<br/>"),
    attachments: graphAttachments,
  });

  const creditRequest = await db.query.creditRequests.findFirst({
    where: and(
      eq(creditRequests.threadId, params.threadId),
      eq(creditRequests.organizationId, params.organizationId),
    ),
  });

  if (creditRequest && ["AWAITING_USER", "SENT"].includes(creditRequest.status)) {
    await db
      .update(creditRequests)
      .set({ status: "CONTESTED", updatedAt: new Date() })
      .where(eq(creditRequests.id, creditRequest.id));
  }

  await recordAuditEvent({
    userId: params.userId,
    action: "email.reply_sent",
    details: { threadId: params.threadId },
  });

  return { success: true as const };
}

export async function updateCreditRequestStatus(params: {
  organizationId: string;
  userId: string;
  creditRequestId: string;
  status: CreditRequestStatus;
  carrierDecision?: CarrierDecision | null;
}) {
  const request = await db.query.creditRequests.findFirst({
    where: and(
      eq(creditRequests.id, params.creditRequestId),
      eq(creditRequests.organizationId, params.organizationId),
    ),
  });

  if (!request) {
    return { error: "Credit request not found" as const };
  }

  const [updated] = await db
    .update(creditRequests)
    .set({
      status: params.status,
      carrierDecision: params.carrierDecision ?? request.carrierDecision,
      updatedAt: new Date(),
    })
    .where(eq(creditRequests.id, params.creditRequestId))
    .returning();

  await recordAuditEvent({
    invoiceId: request.invoiceId,
    userId: params.userId,
    action: "credit_request.updated",
    details: {
      creditRequestId: request.id,
      status: params.status,
      carrierDecision: params.carrierDecision,
    },
  });

  return { creditRequest: updated };
}

export async function createSupplierFromMessage(params: {
  organizationId: string;
  messageId: string;
  name: string;
  email: string;
  contactName?: string;
  emailDomains?: string[];
}) {
  const message = await db.query.mailboxMessages.findFirst({
    where: and(
      eq(mailboxMessages.id, params.messageId),
      eq(mailboxMessages.organizationId, params.organizationId),
    ),
  });

  if (!message) {
    return { error: "Message not found" as const };
  }

  const email = params.email.trim().toLowerCase();
  if (!email.includes("@")) {
    return { error: "A valid email address is required" as const };
  }

  const name = params.name.trim();
  if (!name) {
    return { error: "Supplier name is required" as const };
  }

  const domain = email.split("@")[1]?.toLowerCase();
  const emailDomains =
    params.emailDomains?.map((entry) => entry.trim().toLowerCase()).filter(Boolean) ??
    (domain ? [domain] : []);

  const outcome = await createSupplierFromEmailContact({
    organizationId: params.organizationId,
    email,
    name,
    contactName: params.contactName,
    emailDomains,
  });

  if ("error" in outcome && outcome.error) {
    return outcome;
  }

  await linkSupplierToThreadsAndMessages({
    organizationId: params.organizationId,
    supplierId: outcome.supplier!.id,
    email,
  });

  await db
    .update(mailboxMessages)
    .set({ supplierId: outcome.supplier!.id })
    .where(eq(mailboxMessages.id, message.id));

  if (message.threadId) {
    await db
      .update(emailThreads)
      .set({ supplierId: outcome.supplier!.id, updatedAt: new Date() })
      .where(eq(emailThreads.id, message.threadId));
  }

  return outcome;
}
