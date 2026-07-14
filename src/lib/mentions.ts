// Mentions are stored inline in note content as `@[Display Name](userId)`
// tokens so the note itself records who was tagged without a join table.

const MENTION_PATTERN = /@\[([^\]]+)\]\(([^)]+)\)/g;

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; name: string; userId: string };

export function mentionToken(name: string, userId: string) {
  return `@[${name}](${userId})`;
}

/** Split note content into text and mention segments for rendering. */
export function splitMentionSegments(content: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(MENTION_PATTERN)) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: "mention", name: match[1], userId: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", text: content.slice(lastIndex) });
  }
  return segments;
}

/** Unique user ids mentioned in note content. */
export function extractMentionedUserIds(content: string): string[] {
  return [...new Set([...content.matchAll(MENTION_PATTERN)].map((match) => match[2]))];
}

/** Replace mention tokens with plain `@Name` text (for notification bodies). */
export function stripMentionTokens(content: string): string {
  return content.replace(MENTION_PATTERN, "@$1");
}
