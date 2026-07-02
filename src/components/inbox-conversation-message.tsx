"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronDownIcon, FileTextIcon, Loader2Icon, PaperclipIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  isDisplayAttachment,
  prepareEmailHtmlForDisplay,
} from "@/lib/email-body";
import { EmailMessageBody } from "@/components/email-message-body";
import { cn } from "@/lib/utils";

function formatMessageDate(value: Date | string | null) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function invoiceChipLabel(invoice: NonNullable<ConversationMessage["invoice"]>) {
  const raw = invoice.originalFileName ?? invoice.vendorName;
  if (raw) {
    return raw.replace(/\.[^.]+$/, "");
  }
  return `invoice_${invoice.id.slice(-6)}`;
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
  supplier: { id: string; name: string } | null;
  invoice: {
    id: string;
    vendorName: string | null;
    originalFileName: string | null;
  } | null;
  attachments: Array<{
    id: string;
    fileName: string;
    isInline: boolean | null;
    contentId: string | null;
  }>;
};

type InboxConversationMessageProps = {
  message: ConversationMessage;
  index: number;
  onCreateSupplier: (message: ConversationMessage) => void;
  onProcessInvoice?: (messageId: string) => Promise<void>;
  processingInvoiceId?: string | null;
};

export function InboxConversationMessage({
  message,
  index,
  onCreateSupplier,
  onProcessInvoice,
  processingInvoiceId,
}: InboxConversationMessageProps) {
  const senderLabel = message.fromName
    ? `${message.fromName} <${message.fromEmail}>`
    : (message.fromEmail ?? "Unknown sender");
  const isLinked = Boolean(message.supplierId);
  const displayAttachments = message.attachments.filter(isDisplayAttachment);
  const canProcessInvoice =
    message.direction === "INBOUND" &&
    isLinked &&
    !message.invoice &&
    (displayAttachments.length > 0 || Boolean(message.bodyText || message.bodyHtml));
  const isProcessing = processingInvoiceId === message.id;
  const renderedHtml = useMemo(() => {
    if (!message.bodyHtml) return null;
    return prepareEmailHtmlForDisplay(message.bodyHtml, message.attachments);
  }, [message.bodyHtml, message.attachments]);

  return (
    <Collapsible
      defaultOpen
      className={cn("group/collapsible relative", index > 0 && "mt-3")}
    >
      <div
        className={cn(
          "min-w-0 overflow-hidden rounded-lg border bg-background",
          message.direction === "INBOUND" &&
            (isLinked
              ? "border-emerald-400 bg-emerald-50/90 shadow-sm ring-1 ring-emerald-200/80"
              : "border-muted-foreground/25 bg-muted/30"),
        )}
      >
          <div
            className={cn(
              "flex items-start gap-2 border-b px-4 py-2.5",
              message.direction === "INBOUND" &&
                isLinked &&
                "border-emerald-200/80 bg-emerald-100/70",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{senderLabel}</p>
                <Badge variant="outline" className="text-[10px]">
                  {message.direction === "OUTBOUND" ? "Sent" : "Received"}
                </Badge>
                {message.direction === "INBOUND" ? (
                  isLinked ? (
                    <Badge className="border-emerald-600 bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
                      {message.supplier?.name ?? "Supplier linked"}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-muted-foreground/30 bg-muted text-[10px] text-muted-foreground"
                    >
                      No supplier
                    </Badge>
                  )
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatMessageDate(message.receivedAt)}
              </p>

              {message.invoice ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs text-muted-foreground">1 linked invoice</span>
                  <Link
                    href={`/invoices/${message.invoice.id}`}
                    className="inline-flex max-w-48 items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-xs transition-colors hover:bg-muted/60"
                    title={invoiceChipLabel(message.invoice)}
                  >
                    <FileTextIcon className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{invoiceChipLabel(message.invoice)}</span>
                  </Link>
                </div>
              ) : null}

              {displayAttachments.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs text-muted-foreground">
                    {displayAttachments.length} attachment
                    {displayAttachments.length === 1 ? "" : "s"}
                  </span>
                  <ul className="flex flex-wrap items-center gap-1">
                    {displayAttachments.map((attachment) => (
                      <li key={attachment.id}>
                        <a
                          href={`/api/inbox/attachments/${attachment.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-48 items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-xs transition-colors hover:bg-muted/60"
                          title={attachment.fileName}
                        >
                          <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{attachment.fileName}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {canProcessInvoice && onProcessInvoice ? (
                <Button
                  size="sm"
                  disabled={isProcessing}
                  onClick={(event) => {
                    event.stopPropagation();
                    void onProcessInvoice(message.id);
                  }}
                >
                  {isProcessing ? (
                    <>
                      <Loader2Icon className="size-3.5 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    "Create invoice"
                  )}
                </Button>
              ) : null}
              {message.direction === "INBOUND" && !message.supplierId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCreateSupplier(message);
                  }}
                >
                  Create supplier
                </Button>
              ) : null}
              <CollapsibleTrigger
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60"
                aria-label="Toggle message"
              >
                <ChevronDownIcon className="size-4 transition-transform group-data-open/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </div>
          </div>

          <CollapsibleContent className="bg-white px-4 py-4">
            <div className="w-full min-w-0 text-sm leading-relaxed text-foreground">
              {renderedHtml ? (
                <EmailMessageBody html={renderedHtml} />
              ) : message.bodyText ? (
                <p className="whitespace-pre-wrap break-words">{message.bodyText}</p>
              ) : (
                <p className="text-muted-foreground">No message body.</p>
              )}
            </div>
          </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
