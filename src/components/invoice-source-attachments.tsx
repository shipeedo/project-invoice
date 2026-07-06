"use client";

import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isInvoiceLikeAttachment } from "@/lib/attachment-types";
import { cn } from "@/lib/utils";

export type InvoiceSourceAttachment = {
  key: string;
  fileName: string;
  href: string;
  mimeType?: string | null;
  isPrimary: boolean;
};

function fileExtension(fileName: string) {
  const match = fileName.match(/\.([^.]+)$/);
  return match ? match[1].toUpperCase() : "FILE";
}

function AttachmentRow({ attachment }: { attachment: InvoiceSourceAttachment }) {
  return (
    <li>
      <a
        href={attachment.href}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
          attachment.isPrimary
            ? "bg-primary/10 hover:bg-primary/15"
            : "bg-muted/50 hover:bg-muted/70",
        )}
      >
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md",
            attachment.isPrimary ? "bg-primary/10" : "bg-background",
          )}
        >
          <FileTextIcon
            className={cn(
              "size-4",
              attachment.isPrimary ? "text-primary" : "text-muted-foreground",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-medium">{attachment.fileName}</p>
            {attachment.isPrimary ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                Primary
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {fileExtension(attachment.fileName)} · Open in new tab
          </p>
        </div>
        <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </a>
    </li>
  );
}

export function InvoiceSourceAttachments({
  attachments,
}: {
  attachments: InvoiceSourceAttachment[];
}) {
  const [showAll, setShowAll] = useState(false);

  if (attachments.length === 0) return null;

  const supported = attachments.filter((attachment) =>
    isInvoiceLikeAttachment(attachment.fileName, attachment.mimeType),
  );
  const hiddenCount = attachments.length - supported.length;
  const visible = showAll || hiddenCount === 0 ? attachments : supported;

  return (
    <div className="space-y-2">
      {visible.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {visible.map((attachment) => (
            <AttachmentRow key={attachment.key} attachment={attachment} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No supported attachments to display.
        </p>
      )}

      {hiddenCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 text-muted-foreground hover:text-foreground"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll
            ? "Show supported attachments only"
            : `Show all attachments (${hiddenCount} hidden)`}
        </Button>
      ) : null}
    </div>
  );
}
