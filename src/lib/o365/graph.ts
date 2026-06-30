export type GraphMailbox = {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
};

export type GraphMessage = {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
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

  return (await response.json()) as T;
}

export async function listGraphMailboxes(accessToken: string, search?: string) {
  const mailboxes: GraphMailbox[] = [];

  const me = await graphFetch<GraphMailbox>(
    accessToken,
    "/me?$select=id,displayName,mail,userPrincipalName",
  );
  if (me.mail || me.userPrincipalName) {
    mailboxes.push({
      id: me.id,
      displayName: me.displayName ?? me.mail ?? me.userPrincipalName,
      mail: me.mail ?? me.userPrincipalName,
      userPrincipalName: me.userPrincipalName,
    });
  }

  const filter = search?.trim()
    ? `&$filter=startswith(displayName,'${search.trim().replace(/'/g, "''")}') or startswith(mail,'${search.trim().replace(/'/g, "''")}')`
    : "";

  const users = await graphFetch<GraphListResponse<GraphMailbox>>(
    accessToken,
    `/users?$select=id,displayName,mail,userPrincipalName&$top=100${filter}`,
  );

  for (const user of users.value) {
    if (!user.mail && !user.userPrincipalName) continue;
    if (mailboxes.some((entry) => entry.id === user.id)) continue;
    mailboxes.push({
      id: user.id,
      displayName: user.displayName ?? user.mail ?? user.userPrincipalName,
      mail: user.mail ?? user.userPrincipalName,
      userPrincipalName: user.userPrincipalName,
    });
  }

  return mailboxes.sort((a, b) => a.displayName.localeCompare(b.displayName));
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
    `/users/${encodeURIComponent(params.mailboxUpn)}/mailFolders/inbox/messages?$select=id,subject,receivedDateTime,hasAttachments,from,bodyPreview&$orderby=receivedDateTime desc&$top=${params.top ?? 25}${filter}`,
  );
}

export async function getMessageDetails(params: {
  accessToken: string;
  mailboxUpn: string;
  messageId: string;
}) {
  return graphFetch<GraphMessage>(
    params.accessToken,
    `/users/${encodeURIComponent(params.mailboxUpn)}/messages/${encodeURIComponent(params.messageId)}?$select=id,subject,receivedDateTime,hasAttachments,from,body,bodyPreview`,
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
