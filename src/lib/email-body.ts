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

export function sanitizeEmailHtmlForDisplay(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/<base[^>]*>/gi, "");
}

export function isDisplayAttachment(attachment: { isInline: boolean | null }) {
  return !attachment.isInline;
}

export function prepareEmailHtmlForDisplay(
  html: string,
  attachments: InlineAttachment[],
) {
  return sanitizeEmailHtmlForDisplay(rewriteInlineImageSources(html, attachments));
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ParsedEmailPartSource = "wrapper" | "forwarded" | "reply";

export type ParsedEmailPart = {
  source: ParsedEmailPartSource;
  fromName: string | null;
  fromEmail: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  date: string | null;
  body: string;
};

const FORWARD_DELIMITER_PATTERNS: RegExp[] = [
  /\r?\n-{3,}\s*Original Message\s*-{3,}\s*\r?\n/i,
  /\r?\n-{5,}\s*Forwarded message\s*-{5,}\s*\r?\n/i,
  /\r?\nBegin forwarded message:\s*\r?\n/i,
  /\r?\nOn .+ wrote:\s*\r?\n/i,
  /\r?\n-{2,}\s*on .+?\bwrote\s*-{2,}\s*\r?\n/i,
];

const FORWARD_DETECTION_PATTERNS: RegExp[] = [
  /-{3,}\s*Original Message\s*-{3,}/i,
  /-{5,}\s*Forwarded message\s*-{5,}/i,
  /Begin forwarded message:/i,
  /\bFrom:\s*.+\r?\n(?:Sent|Date):/i,
  /-{2,}\s*on .+?\bwrote\s*-{2,}/i,
];

const REFERENCED_COMPANY_PATTERNS: RegExp[] = [
  /Claimant:\s*(.+?)(?:\n|$)/i,
  /Business Name:\s*(.+?)(?:\n|$)/i,
  /Credit Claim - [^-]+ - (.+?) Consignment/i,
];

const HEADER_LINE =
  /^(From|Sent|Date|To|Cc|Subject)\s*:\s*(.+)$/i;

export function preprocessHtmlForThreadSplit(html: string) {
  return html
    .replace(
      /<div[^>]*\bid="?(?:divRplyFwdMsg|mail-editor-reference-message-container)"?[^>]*>/gi,
      "\n-----Original Message-----\n",
    )
    .replace(
      /<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>/gi,
      "\n---------- Forwarded message ---------\n",
    );
}

export function resolvePlainEmailBody(params: {
  bodyHtml?: string | null;
  bodyText?: string | null;
}) {
  if (params.bodyText?.trim()) {
    return params.bodyText.trim();
  }
  if (params.bodyHtml?.trim()) {
    return htmlToPlainText(preprocessHtmlForThreadSplit(params.bodyHtml));
  }
  return "";
}

export function isForwardedEmailBody(body: string) {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  if (!normalized) return false;
  return FORWARD_DETECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizeBodyText(body: string) {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/(?:\n-----Original Message-----\n){2,}/gi, "\n-----Original Message-----\n")
    .trim();
}

function stripLeadingForwardMarker(text: string) {
  return text
    .replace(
      /^(?:-{3,}\s*Original Message\s*-{3,}|(-{5,}\s*Forwarded message\s*-{5,}))\s*\n+/i,
      "",
    )
    .trim();
}

function parseEmailAddress(value: string): {
  name: string | null;
  email: string | null;
} {
  const trimmed = value.trim();
  const angleMatch = trimmed.match(
    /^("([^"]+)"|([^<]+?))\s*<([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})>$/,
  );
  if (angleMatch) {
    const name = (angleMatch[2] ?? angleMatch[3])?.trim() || null;
    return { name, email: angleMatch[4].toLowerCase() };
  }

  const emailMatch = trimmed.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  const email = emailMatch?.[0]?.toLowerCase() ?? null;

  if (!email) {
    return { name: trimmed || null, email: null };
  }

  if (trimmed.toLowerCase() === email) {
    return { name: null, email };
  }

  return { name: trimmed, email };
}

function parseRecipientList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((entry) => parseEmailAddress(entry).email)
    .filter((entry): entry is string => Boolean(entry));
}

function parseEmbeddedHeaders(text: string): {
  fromName: string | null;
  fromEmail: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  date: string | null;
  body: string;
  source: ParsedEmailPartSource;
} {
  const lines = text.split(/\r?\n/);
  const rawHeaders: Record<string, string> = {};
  let index = 0;
  let source: ParsedEmailPartSource = "forwarded";

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      if (Object.keys(rawHeaders).length > 0) break;
      continue;
    }

    const headerMatch = line.match(HEADER_LINE);
    if (headerMatch) {
      rawHeaders[headerMatch[1].toLowerCase()] = headerMatch[2].trim();
      index += 1;
      continue;
    }

    const onWroteMatch = line.match(/^On .+ wrote:\s*$/i);
    if (onWroteMatch) {
      source = "reply";
      const fromOnLine = line.match(/^On .+?(\S+@\S+)/i);
      if (fromOnLine) {
        rawHeaders.from = fromOnLine[1];
      }
      index += 1;
      break;
    }

    break;
  }

  const from = parseEmailAddress(rawHeaders.from ?? "");
  const date = rawHeaders.sent ?? rawHeaders.date ?? null;

  return {
    fromName: from.name,
    fromEmail: from.email,
    toEmails: rawHeaders.to ? parseRecipientList(rawHeaders.to) : [],
    ccEmails: rawHeaders.cc ? parseRecipientList(rawHeaders.cc) : [],
    subject: rawHeaders.subject?.trim() || null,
    date,
    body: lines.slice(index).join("\n").trim(),
    source,
  };
}

function findFirstDelimiter(body: string): {
  index: number;
  length: number;
} | null {
  let earliest: { index: number; length: number } | null = null;

  for (const pattern of FORWARD_DELIMITER_PATTERNS) {
    const match = pattern.exec(body);
    if (!match || match.index === undefined) continue;

    const candidate = { index: match.index, length: match[0].length };
    if (!earliest || candidate.index < earliest.index) {
      earliest = candidate;
    }
  }

  return earliest;
}

function parseDelimiterLine(text: string): {
  source: ParsedEmailPartSource;
  fromName: string | null;
  fromEmail: string | null;
  date: string | null;
} | null {
  const dashedWrote = text.match(/-{2,}\s*on\s+(.+)\s+wrote\s*-{2,}/i);
  if (!dashedWrote) return null;

  const content = dashedWrote[1].trim();
  const emailMatch = content.match(
    /<?([A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?$/,
  );
  if (!emailMatch) return null;

  const fromEmail = emailMatch[1].toLowerCase();
  const beforeEmail = content
    .slice(0, content.lastIndexOf(emailMatch[0]))
    .replace(/<[^>]*$/, "")
    .trim();

  const dateNameMatch = beforeEmail.match(
    /^(.+?\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?(?:\s+\+[0-9]{4})?)?)\s+(.+)$/i,
  );

  return {
    source: "reply",
    date: dateNameMatch?.[1]?.trim() ?? (beforeEmail || null),
    fromName: dateNameMatch?.[2]?.trim() ?? (beforeEmail || null),
    fromEmail,
  };
}

function splitAtFirstDelimiter(body: string): {
  before: string;
  after: string;
  source: ParsedEmailPartSource;
  delimiterMeta: ReturnType<typeof parseDelimiterLine>;
} | null {
  const delimiter = findFirstDelimiter(body);
  if (!delimiter) return null;

  const delimiterText = body.slice(delimiter.index, delimiter.index + delimiter.length);
  const before = body.slice(0, delimiter.index).trim();
  const after = body.slice(delimiter.index + delimiter.length).trim();
  const delimiterMeta = parseDelimiterLine(delimiterText);
  const source = delimiterMeta
    ? "reply"
    : /wrote:\s*$/i.test(delimiterText)
      ? "reply"
      : "forwarded";

  return { before, after, source, delimiterMeta };
}

function buildStandalonePart(
  source: ParsedEmailPartSource,
  body: string,
): ParsedEmailPart {
  return {
    source,
    fromName: null,
    fromEmail: null,
    toEmails: [],
    ccEmails: [],
    subject: null,
    date: null,
    body,
  };
}

function buildHeaderPart(
  headers: ReturnType<typeof parseEmbeddedHeaders>,
  body: string,
): ParsedEmailPart {
  return {
    source: headers.source,
    fromName: headers.fromName,
    fromEmail: headers.fromEmail,
    toEmails: headers.toEmails,
    ccEmails: headers.ccEmails,
    subject: headers.subject,
    date: headers.date,
    body: body || "(No message body)",
  };
}

export function splitEmailThread(body: string): ParsedEmailPart[] {
  const normalized = normalizeBodyText(body);
  if (!normalized) {
    return [];
  }

  const parts: ParsedEmailPart[] = [];

  function splitRecursive(text: string, isRoot: boolean) {
    const delimiterSplit = splitAtFirstDelimiter(text);
    if (!delimiterSplit) {
      const headers = parseEmbeddedHeaders(text);
      const hasParsedHeaders = Boolean(
        headers.fromEmail ||
          headers.subject ||
          headers.toEmails.length > 0 ||
          headers.date,
      );

      if (hasParsedHeaders) {
        parts.push(buildHeaderPart(headers, headers.body));
        return;
      }

      if (text.trim()) {
        parts.push(buildStandalonePart(isRoot ? "wrapper" : "forwarded", text));
      }
      return;
    }

    if (delimiterSplit.before.trim()) {
      parts.push(
        buildStandalonePart(isRoot ? "wrapper" : "forwarded", delimiterSplit.before),
      );
    }

    const headers = parseEmbeddedHeaders(delimiterSplit.after);
    const hasParsedHeaders = Boolean(
      headers.fromEmail ||
        headers.subject ||
        headers.toEmails.length > 0 ||
        headers.date,
    );

    if (!hasParsedHeaders) {
      if (delimiterSplit.delimiterMeta) {
        parts.push({
          source: delimiterSplit.delimiterMeta.source,
          fromName: delimiterSplit.delimiterMeta.fromName,
          fromEmail: delimiterSplit.delimiterMeta.fromEmail,
          toEmails: [],
          ccEmails: [],
          subject: null,
          date: delimiterSplit.delimiterMeta.date,
          body:
            stripLeadingForwardMarker(delimiterSplit.after) || "(No message body)",
        });
        return;
      }

      splitRecursive(delimiterSplit.after, false);
      return;
    }

    const nestedSplit = splitAtFirstDelimiter(headers.body);
    if (nestedSplit) {
      parts.push(
        buildHeaderPart(headers, nestedSplit.before.trim() || "(No message body)"),
      );

      if (nestedSplit.delimiterMeta) {
        parts.push({
          source: nestedSplit.delimiterMeta.source,
          fromName: nestedSplit.delimiterMeta.fromName,
          fromEmail: nestedSplit.delimiterMeta.fromEmail,
          toEmails: [],
          ccEmails: [],
          subject: null,
          date: nestedSplit.delimiterMeta.date,
          body:
            stripLeadingForwardMarker(nestedSplit.after) || "(No message body)",
        });
      } else {
        splitRecursive(nestedSplit.after, false);
      }
      return;
    }

    parts.push(buildHeaderPart(headers, headers.body));
  }

  splitRecursive(normalized, true);
  return parts.filter((part) => part.body.trim() || part.fromEmail);
}

export function getEmbeddedSenderFromForwardedBody(body: string): {
  fromEmail: string | null;
  fromName: string | null;
} {
  const parts = splitEmailThread(body);
  const embedded = parts.filter(
    (part) => part.source !== "wrapper" && part.fromEmail,
  );

  const innermost = embedded.at(-1);
  return {
    fromEmail: innermost?.fromEmail ?? null,
    fromName: innermost?.fromName ?? null,
  };
}

function cleanReferencedCompanyName(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[[\]#]/g, "")
    .trim();
}

export function extractReferencedCompanyFromEmail(params: {
  subject?: string | null;
  body: string;
}): string | null {
  const sources = [params.body, params.subject ?? ""];
  for (const source of sources) {
    if (!source.trim()) continue;
    for (const pattern of REFERENCED_COMPANY_PATTERNS) {
      const match = source.match(pattern);
      const company = match?.[1] ? cleanReferencedCompanyName(match[1]) : null;
      if (company) return company;
    }
  }

  for (const part of [...splitEmailThread(params.body)].reverse()) {
    for (const pattern of REFERENCED_COMPANY_PATTERNS) {
      const match = part.body.match(pattern);
      const company = match?.[1] ? cleanReferencedCompanyName(match[1]) : null;
      if (company) return company;
    }
  }

  return null;
}
