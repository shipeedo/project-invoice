export type GraphMailbox = {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
};

export type GraphMessage = {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
  }>;
  body?: {
    contentType?: string;
    content?: string;
  };
  bodyPreview?: string;
};

export type GraphAttachment = {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  "@odata.type"?: string;
};

type GraphListResponse<T> = {
  value: T[];
  "@odata.nextLink"?: string;
};

async function graphFetch<T>(accessToken: string, path: string, init?: RequestInit) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft Graph error (${response.status}): ${text}`);
  }

  if (response.status === 204 || response.status === 202) {
    return null as T;
  }

  const text = await response.text();
  if (!text) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

export async function listGraphMailboxes(accessToken: string, search?: string) {
  const mailboxes: GraphMailbox[] = [];

  const me = await graphFetch<GraphMailbox>(
    accessToken,
    "/me?$select=id,displayName,mail,userPrincipalName",
  );
  if (me.mail || me.userPrincipalName) {
    mailboxes.push(normalizeGraphMailbox(me));
  }

  const trimmedSearch = search?.trim();
  let usersPath = `/users?$select=id,displayName,mail,userPrincipalName&$top=999&$orderby=displayName`;
  if (trimmedSearch) {
    const escaped = trimmedSearch.replace(/'/g, "''");
    const filter = encodeURIComponent(
      `startswith(displayName,'${escaped}') or startswith(mail,'${escaped}') or startswith(userPrincipalName,'${escaped}') or contains(displayName,'${escaped}') or contains(mail,'${escaped}') or contains(userPrincipalName,'${escaped}')`,
    );
    usersPath = `/users?$select=id,displayName,mail,userPrincipalName&$top=999&$filter=${filter}&$orderby=displayName`;
  }

  const users = await graphFetch<GraphListResponse<GraphMailbox>>(
    accessToken,
    usersPath,
  );

  for (const user of users.value) {
    if (!user.mail && !user.userPrincipalName) continue;
    if (mailboxes.some((entry) => entry.id === user.id)) continue;
    mailboxes.push(normalizeGraphMailbox(user));
  }

  return mailboxes.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function normalizeGraphMailbox(user: GraphMailbox): GraphMailbox {
  const address = user.mail || user.userPrincipalName;
  return {
    id: user.id,
    displayName: user.displayName ?? address,
    mail: address,
    userPrincipalName: user.userPrincipalName,
  };
}

export async function resolveGraphMailboxByAddress(
  accessToken: string,
  address: string,
) {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error("Mailbox address is required");
  }

  const user = await graphFetch<GraphMailbox>(
    accessToken,
    `/users/${encodeURIComponent(trimmed)}?$select=id,displayName,mail,userPrincipalName`,
  );

  if (!user.mail && !user.userPrincipalName) {
    throw new Error("No mailbox found for that address");
  }

  return normalizeGraphMailbox(user);
}

export async function listInboxMessages(params: {
  accessToken: string;
  mailboxUpn: string;
  since?: Date | null;
  top?: number;
}) {
  const sinceFilter = params.since
    ? `receivedDateTime ge ${params.since.toISOString()}`
    : null;
  const filter = sinceFilter ? `&$filter=${encodeURIComponent(sinceFilter)}` : "";

  return graphFetch<GraphListResponse<GraphMessage>>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailboxUpn)}/mailFolders/inbox/messages?$select=id,conversationId,internetMessageId,subject,receivedDateTime,sentDateTime,hasAttachments,from,toRecipients,ccRecipients,bodyPreview&$orderby=receivedDateTime desc&$top=${params.top ?? 25}${filter}`,
  );
}

export async function getMessageDetails(params: {
  accessToken: string;
  mailboxUpn: string;
  messageId: string;
}) {
  return graphFetch<GraphMessage>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailboxUpn)}/messages/${encodeURIComponent(params.messageId)}?$select=id,conversationId,internetMessageId,subject,receivedDateTime,sentDateTime,hasAttachments,from,toRecipients,ccRecipients,body,bodyPreview`,
  );
}

export async function listMessageAttachments(params: {
  accessToken: string;
  mailboxUpn: string;
  messageId: string;
}) {
  return graphFetch<GraphListResponse<GraphAttachment>>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailboxUpn)}/messages/${encodeURIComponent(params.messageId)}/attachments?$select=id,name,contentType,size`,
  );
}

export async function downloadFileAttachment(params: {
  accessToken: string;
  mailboxUpn: string;
  messageId: string;
  attachmentId: string;
}) {
  const attachment = await graphFetch<GraphAttachment & { contentBytes?: string }>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailboxUpn)}/messages/${encodeURIComponent(params.messageId)}/attachments/${encodeURIComponent(params.attachmentId)}`,
  );

  if (!attachment.contentBytes) {
    throw new Error(`Attachment ${params.attachmentId} has no content`);
  }

  return {
    name: attachment.name ?? "attachment",
    contentType: attachment.contentType ?? "application/octet-stream",
    size: attachment.size ?? Buffer.from(attachment.contentBytes, "base64").length,
    buffer: Buffer.from(attachment.contentBytes, "base64"),
  };
}

const MESSAGE_SELECT =
  "id,conversationId,internetMessageId,subject,receivedDateTime,sentDateTime,hasAttachments,from,toRecipients,ccRecipients,body,bodyPreview";

export async function listThreadMessages(params: {
  accessToken: string;
  mailboxUpn: string;
  conversationId: string;
}) {
  const filter = encodeURIComponent(
    `conversationId eq '${params.conversationId.replace(/'/g, "''")}'`,
  );
  return graphFetch<GraphListResponse<GraphMessage>>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailboxUpn)}/messages?$filter=${filter}&$select=${MESSAGE_SELECT}&$orderby=receivedDateTime asc&$top=50`,
  );
}

export type SendMailAttachment = {
  name: string;
  contentType: string;
  contentBytes: string;
};

export async function sendMail(params: {
  accessToken: string;
  mailboxUpn: string;
  subject: string;
  bodyHtml: string;
  to: string[];
  cc?: string[];
  attachments?: SendMailAttachment[];
}) {
  const message: Record<string, unknown> = {
    subject: params.subject,
    body: { contentType: "HTML", content: params.bodyHtml },
    toRecipients: params.to.map((address) => ({
      emailAddress: { address },
    })),
  };

  if (params.cc?.length) {
    message.ccRecipients = params.cc.map((address) => ({
      emailAddress: { address },
    }));
  }

  if (params.attachments?.length) {
    message.attachments = params.attachments.map((attachment) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: attachment.name,
      contentType: attachment.contentType,
      contentBytes: attachment.contentBytes,
    }));
  }

  await graphFetch<null>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailboxUpn)}/sendMail`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    },
  );
}

export async function replyToMessage(params: {
  accessToken: string;
  mailboxUpn: string;
  messageId: string;
  bodyHtml: string;
  attachments?: SendMailAttachment[];
}) {
  const message: Record<string, unknown> = {
    body: { contentType: "HTML", content: params.bodyHtml },
  };

  if (params.attachments?.length) {
    message.attachments = params.attachments.map((attachment) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: attachment.name,
      contentType: attachment.contentType,
      contentBytes: attachment.contentBytes,
    }));
  }

  await graphFetch<null>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailboxUpn)}/messages/${encodeURIComponent(params.messageId)}/reply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
  );
}

export function extractEmailAddresses(
  recipients?: GraphMessage["toRecipients"],
) {
  if (!recipients) return [];
  return recipients
    .map((entry) => entry.emailAddress?.address?.trim())
    .filter((value): value is string => Boolean(value));
}

export function extractMessageBody(message: GraphMessage) {
  const content = message.body?.content ?? "";
  if (message.body?.contentType?.toLowerCase() === "html") {
    return { html: content, text: message.bodyPreview ?? null };
  }
  return { html: null, text: content || message.bodyPreview || null };
}
