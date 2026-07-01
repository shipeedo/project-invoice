"use client";

import type { ConversationMessage } from "@/components/inbox-conversation-message";

export type ThreadAttachment = {
  id: string;
  fileName: string;
};

export function collectThreadAttachments(
  messages: ConversationMessage[],
): ThreadAttachment[] {
  const seen = new Map<string, ThreadAttachment>();

  for (const message of messages) {
    for (const attachment of message.attachments) {
      const key = attachment.fileName.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.set(key, {
        id: attachment.id,
        fileName: attachment.fileName,
      });
    }
  }

  return Array.from(seen.values());
}
