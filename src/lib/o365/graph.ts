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
  isInline?: boolean;
  contentId?: string | null;
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

const MAILBOX_ACCESS_DENIED =
  "You do not have read access to this mailbox. Ask your Exchange admin to grant you Full Access.";

function isMailboxAccessDenied(status: number, body: string) {
  if (status === 403) return true;
  if (status === 404) {
    return (
      body.includes("ErrorItemNotFound") ||
      body.includes("ErrorInvalidUser") ||
      body.includes("Default folder") ||
      body.includes("MailboxNotEnabledForRESTAPI")
    );
  }
  return false;
}

async function graphProbe(accessToken: string, path: string) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

function mailboxIdentifiers(mailbox: Pick<GraphMailbox, "id" | "mail" | "userPrincipalName">) {
  return [
    ...new Set(
      [mailbox.id, mailbox.mail, mailbox.userPrincipalName].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ];
}

export async function canReadGraphMailbox(
  accessToken: string,
  mailbox: Pick<GraphMailbox, "id" | "mail" | "userPrincipalName">,
) {
  const probeSuffixes = [
    "/mailFolders('Inbox')?$select=id",
    "/mailFolders/inbox?$select=id",
    "/messages?$top=1&$select=id",
  ];

  const identifiers = mailbox.id
    ? [mailbox.id]
    : mailboxIdentifiers(mailbox);

  for (const identifier of identifiers) {
    const mailboxPath = `/users/${encodeURIComponent(identifier)}`;
    for (const suffix of probeSuffixes) {
      const result = await graphProbe(accessToken, `${mailboxPath}${suffix}`);
      if (result.ok) {
        return true;
      }
      if (!isMailboxAccessDenied(result.status, result.text)) {
        throw new Error(`Microsoft Graph error (${result.status}): ${result.text}`);
      }
    }
  }

  return false;
}

export async function verifyGraphMailboxReadAccess(
  accessToken: string,
  mailbox: GraphMailbox,
  options?: { signedInUserId?: string },
) {
  if (options?.signedInUserId && mailbox.id === options.signedInUserId) {
    return mailbox;
  }

  if (!(await canReadGraphMailbox(accessToken, mailbox))) {
    throw new Error(MAILBOX_ACCESS_DENIED);
  }

  return mailbox;
}

export async function checkGraphMailboxReadAccess(
  accessToken: string,
  mailbox: GraphMailbox,
) {
  const me = await graphFetch<GraphMailbox>(accessToken, "/me?$select=id");
  if (mailbox.id === me.id) {
    return { accessible: true as const, mailbox };
  }

  const accessible = await canReadGraphMailbox(accessToken, mailbox);
  if (!accessible) {
    return {
      accessible: false as const,
      error: MAILBOX_ACCESS_DENIED,
    };
  }

  return { accessible: true as const, mailbox };
}

export async function listGraphMailboxes(accessToken: string) {
  const mailboxes: GraphMailbox[] = [];

  const me = await graphFetch<GraphMailbox>(
    accessToken,
    "/me?$select=id,displayName,mail,userPrincipalName",
  );
  if (me.mail || me.userPrincipalName) {
    mailboxes.push(normalizeGraphMailbox(me));
  }

  const users = await graphFetch<GraphListResponse<GraphMailbox>>(
    accessToken,
    "/users?$select=id,displayName,mail,userPrincipalName&$top=999",
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

  const mailbox = normalizeGraphMailbox(user);
  const me = await graphFetch<GraphMailbox>(accessToken, "/me?$select=id");
  return verifyGraphMailboxReadAccess(accessToken, mailbox, {
    signedInUserId: me.id,
  });
}

export async function listInboxMessages(params: {
  accessToken: string;
  mailbox: string;
  mailboxUpn?: string | null;
  since?: Date | null;
  top?: number;
}) {
  const select =
    "id,conversationId,internetMessageId,subject,receivedDateTime,sentDateTime,hasAttachments,from,toRecipients,ccRecipients,bodyPreview";
  const top = params.top ?? 50;

  const sortByReceived = (messages: GraphMessage[]) =>
    [...messages].sort((a, b) => {
      const aTime = a.receivedDateTime ? Date.parse(a.receivedDateTime) : 0;
      const bTime = b.receivedDateTime ? Date.parse(b.receivedDateTime) : 0;
      return bTime - aTime;
    });

  const tryFetchMessages = async (
    mailboxPath: string,
    messagePath: string,
    since?: Date | null,
  ) => {
    const attempt = async (includeOrderBy: boolean) => {
      const query = new URLSearchParams();
      query.set("$select", select);
      query.set("$top", String(top));
      if (includeOrderBy) {
        query.set("$orderby", "receivedDateTime desc");
      }
      if (since) {
        query.set("$filter", `receivedDateTime ge ${since.toISOString()}`);
      }
      const result = await graphFetch<GraphListResponse<GraphMessage>>(
        params.accessToken,
        `${mailboxPath}${messagePath}?${query.toString()}`,
      );
      return sortByReceived(result.value ?? []);
    };

    try {
      return await attempt(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("400") && message.includes("orderby")) {
        return attempt(false);
      }
      throw error;
    }
  };

  const isRecoverableMailboxError = (error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    return (
      message.includes("404") ||
      message.includes("403") ||
      message.includes("ErrorItemNotFound") ||
      message.includes("Default folder Inbox not found") ||
      message.includes("Default folder Root not found") ||
      message.includes("MailboxNotEnabledForRESTAPI")
    );
  };

  const inboxMessagePaths = () => [
    "/mailFolders('Inbox')/messages",
    "/mailFolders/inbox/messages",
    "/messages",
  ];

  const mailboxIdentifiers = [
    params.mailbox,
    params.mailboxUpn && params.mailboxUpn !== params.mailbox
      ? params.mailboxUpn
      : null,
  ].filter((value): value is string => Boolean(value));

  const fetchMessages = async (since?: Date | null) => {
    let bestResult: GraphMessage[] = [];

    for (const identifier of mailboxIdentifiers) {
      const mailboxPath = `/users/${encodeURIComponent(identifier)}`;

      for (const messagePath of inboxMessagePaths()) {
        try {
          const messages = await tryFetchMessages(mailboxPath, messagePath, since);
          if (messages.length > bestResult.length) {
            bestResult = messages;
          }
          if (messages.length > 0) {
            return messages;
          }
        } catch (error) {
          if (!isRecoverableMailboxError(error)) {
            throw error;
          }
        }
      }
    }

    return bestResult;
  };

  let messages = await fetchMessages(params.since);
  if (messages.length === 0 && params.since) {
    messages = await fetchMessages(null);
  }

  return { value: messages };
}

export async function getMessageDetails(params: {
  accessToken: string;
  mailbox: string;
  messageId: string;
}) {
  return graphFetch<GraphMessage>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailbox)}/messages/${encodeURIComponent(params.messageId)}?$select=id,conversationId,internetMessageId,subject,receivedDateTime,sentDateTime,hasAttachments,from,toRecipients,ccRecipients,body,bodyPreview`,
  );
}

export async function listMessageAttachments(params: {
  accessToken: string;
  mailbox: string;
  messageId: string;
}) {
  return graphFetch<GraphListResponse<GraphAttachment>>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailbox)}/messages/${encodeURIComponent(params.messageId)}/attachments?$select=id,name,contentType,size,isInline,contentId`,
  );
}

export async function downloadFileAttachment(params: {
  accessToken: string;
  mailbox: string;
  messageId: string;
  attachmentId: string;
}) {
  const attachment = await graphFetch<GraphAttachment & { contentBytes?: string }>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailbox)}/messages/${encodeURIComponent(params.messageId)}/attachments/${encodeURIComponent(params.attachmentId)}`,
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
  mailbox: string;
  conversationId: string;
}) {
  const filter = encodeURIComponent(
    `conversationId eq '${params.conversationId.replace(/'/g, "''")}'`,
  );
  return graphFetch<GraphListResponse<GraphMessage>>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailbox)}/messages?$filter=${filter}&$select=${MESSAGE_SELECT}&$top=50`,
  );
}

export type SendMailAttachment = {
  name: string;
  contentType: string;
  contentBytes: string;
};

export async function sendMail(params: {
  accessToken: string;
  mailbox: string;
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
    `/users/${encodeURIComponent(params.mailbox)}/sendMail`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    },
  );
}

export async function replyToMessage(params: {
  accessToken: string;
  mailbox: string;
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
    `/users/${encodeURIComponent(params.mailbox)}/messages/${encodeURIComponent(params.messageId)}/reply`,
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
  const contentType = message.body?.contentType?.toLowerCase();

  if (contentType === "html" && content) {
    return { html: content, text: null };
  }

  if (content) {
    return { html: null, text: content };
  }

  return { html: null, text: message.bodyPreview ?? null };
}
