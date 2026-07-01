"use client";

import { PaperclipIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ConversationMessage } from "@/components/inbox-conversation-message";

export type ThreadAttachment = {
  id: string;
  fileName: string;
  messageId: string;
  fromLabel: string;
  receivedAt: Date | string | null;
};

export function collectThreadAttachments(
  messages: ConversationMessage[],
): ThreadAttachment[] {
  return messages.flatMap((message) =>
    message.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      messageId: message.id,
      fromLabel: message.fromName ?? message.fromEmail ?? "Unknown sender",
      receivedAt: message.receivedAt,
    })),
  );
}

type InboxThreadAttachmentsProps = {
  attachments: ThreadAttachment[];
};

export function InboxThreadAttachments({ attachments }: InboxThreadAttachmentsProps) {
  if (attachments.length === 0) return null;

  return (
    <section className="shrink-0 border-b bg-muted/10 px-6 py-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <PaperclipIcon className="size-4 text-muted-foreground" />
        <span>
          {attachments.length} attachment{attachments.length === 1 ? "" : "s"} in this
          conversation
        </span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <li key={attachment.id}>
            <a
              href={`/api/inbox/attachments/${attachment.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{attachment.fileName}</span>
              <Badge variant="outline" className="max-w-40 truncate text-[10px] font-normal">
                {attachment.fromLabel}
              </Badge>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
