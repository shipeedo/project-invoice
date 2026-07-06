export type SourceEmailAttachment = {
  id: string;
  fileName: string;
  isInline: boolean | null;
  contentId: string | null;
};

export type InvoiceSourceEmail = {
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  toEmails: string[];
  ccEmails: string[];
  receivedAt: Date | null;
  bodyHtml: string | null;
  bodyText: string | null;
  threadId: string | null;
  attachments: SourceEmailAttachment[];
};

type InvoiceEmailSnapshot = {
  sourceType: "UPLOAD" | "EMAIL";
  emailSubject: string | null;
  emailFrom: string | null;
  emailFromName: string | null;
  emailReceivedAt: Date | null;
  emailBodyHtml: string | null;
  emailBodyText: string | null;
};

type MailboxMessageSource = {
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmails: string | null;
  ccEmails: string | null;
  receivedAt: Date | null;
  bodyHtml: string | null;
  bodyText: string | null;
  threadId: string | null;
  attachments: SourceEmailAttachment[];
};

export function parseRecipientEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

/**
 * Builds the "original email" view for an invoice. The linked mailbox message
 * is the richer source (recipients, thread, attachments); the snapshot stored
 * on the invoice covers invoices ingested before inbox sync existed.
 */
export function resolveInvoiceSourceEmail(params: {
  invoice: InvoiceEmailSnapshot;
  message: MailboxMessageSource | null | undefined;
}): InvoiceSourceEmail | null {
  const { invoice, message } = params;
  if (invoice.sourceType !== "EMAIL") return null;

  // Keep the body html/text pair from a single source so they describe the
  // same message revision.
  const messageHasBody = Boolean(message?.bodyHtml || message?.bodyText);

  const resolved: InvoiceSourceEmail = {
    subject: message?.subject ?? invoice.emailSubject,
    fromName: message?.fromName ?? invoice.emailFromName,
    fromEmail: message?.fromEmail ?? invoice.emailFrom,
    toEmails: parseRecipientEmails(message?.toEmails),
    ccEmails: parseRecipientEmails(message?.ccEmails),
    receivedAt: message?.receivedAt ?? invoice.emailReceivedAt,
    bodyHtml: messageHasBody ? (message?.bodyHtml ?? null) : invoice.emailBodyHtml,
    bodyText: messageHasBody ? (message?.bodyText ?? null) : invoice.emailBodyText,
    threadId: message?.threadId ?? null,
    attachments: message?.attachments ?? [],
  };

  const hasContent = Boolean(
    resolved.subject || resolved.fromEmail || resolved.bodyHtml || resolved.bodyText,
  );

  return hasContent ? resolved : null;
}
