type InlineAttachment = {
  id: string;
  contentId: string | null;
  isInline: boolean | null;
};

export function normalizeContentId(value: string) {
  return value.replace(/^<|>$/g, "").trim().toLowerCase();
}

export function rewriteInlineImageSources(
  html: string,
  attachments: InlineAttachment[],
) {
  const cidMap = new Map<string, string>();

  for (const attachment of attachments) {
    if (!attachment.isInline || !attachment.contentId) continue;
    cidMap.set(normalizeContentId(attachment.contentId), attachment.id);
  }

  if (cidMap.size === 0) return html;

  return html.replace(/cid:([^"'\s>)]+)/gi, (match, rawCid: string) => {
    const attachmentId = cidMap.get(normalizeContentId(rawCid));
    if (!attachmentId) return match;
    return `/api/inbox/attachments/${attachmentId}`;
  });
}

export function isDisplayAttachment(attachment: { isInline: boolean | null }) {
  return !attachment.isInline;
}
