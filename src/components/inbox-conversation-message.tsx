"use client";

import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

function formatMessageDate(value: Date | string | null) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function messagePreview(message: ConversationMessage) {
  const text = message.bodyText?.trim();
  if (text) {
    return text.replace(/\s+/g, " ").slice(0, 140);
  }
  if (message.bodyHtml?.trim()) {
    return "HTML message";
  }
  return "No message body";
}

export type ConversationMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  receivedAt: Date | string | null;
  supplierId: string | null;
  invoice: {
    id: string;
    vendorName: string | null;
    originalFileName: string | null;
  } | null;
  attachments: Array<{
    id: string;
    fileName: string;
  }>;
};

type InboxConversationMessageProps = {
  message: ConversationMessage;
  index: number;
  total: number;
  defaultOpen: boolean;
  onCreateSupplier: (message: ConversationMessage) => void;
};

export function InboxConversationMessage({
  message,
  index,
  total,
  defaultOpen,
  onCreateSupplier,
}: InboxConversationMessageProps) {
  const senderLabel = message.fromName
    ? `${message.fromName} <${message.fromEmail}>`
    : (message.fromEmail ?? "Unknown sender");
  const isLatest = index === total - 1;

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn("group/collapsible relative", index > 0 && "mt-3")}
    >
      <div className="flex gap-3">
        <div className="flex w-5 shrink-0 flex-col items-center">
          <div
            className={cn(
              "mt-3 size-2.5 rounded-full border-2 bg-background",
              message.direction === "OUTBOUND"
                ? "border-primary bg-primary/20"
                : "border-muted-foreground/40",
            )}
          />
          {!isLatest ? (
            <div className="mt-1 w-px flex-1 bg-border group-last:hidden" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-background">
          <CollapsibleTrigger
            className={cn(
              "flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40",
              "group-data-open/collapsible:bg-muted/20",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{senderLabel}</p>
                <Badge variant="outline" className="text-[10px]">
                  {message.direction === "OUTBOUND" ? "Sent" : "Received"}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatMessageDate(message.receivedAt)}
              </p>
              <p className="mt-2 truncate text-sm text-muted-foreground group-data-open/collapsible:hidden">
                {messagePreview(message)}
              </p>
            </div>
            <ChevronDownIcon className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-data-open/collapsible:rotate-180" />
          </CollapsibleTrigger>

          <CollapsibleContent className="border-t px-4 py-4">
            <div className="text-sm leading-relaxed">
              {message.bodyText ? (
                <p className="whitespace-pre-wrap">{message.bodyText}</p>
              ) : message.bodyHtml ? (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
                />
              ) : (
                <p className="text-muted-foreground">No message body.</p>
              )}
            </div>

            {message.invoice ? (
              <p className="mt-4 text-sm">
                <Link
                  href={`/invoices/${message.invoice.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  View linked invoice:{" "}
                  {message.invoice.vendorName ??
                    message.invoice.originalFileName ??
                    message.invoice.id}
                </Link>
              </p>
            ) : null}

            {message.direction === "INBOUND" && !message.supplierId ? (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => onCreateSupplier(message)}
              >
                Create supplier from this email
              </Button>
            ) : null}
          </CollapsibleContent>
        </div>
      </div>
    </Collapsible>
  );
}
