"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MailIcon, MessagesSquareIcon, PaperclipIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmailMessageBody } from "@/components/email-message-body";
import {
  isDisplayAttachment,
  prepareEmailHtmlForDisplay,
} from "@/lib/email-body";
import type { SourceEmailAttachment } from "@/lib/invoice-source-email";

export type InvoiceSourceEmailProps = {
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  toEmails: string[];
  ccEmails: string[];
  receivedAt: Date | string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  threadId: string | null;
  attachments: SourceEmailAttachment[];
};

function formatReceivedAt(value: Date | string | null) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function InvoiceSourceEmailSheet({ email }: { email: InvoiceSourceEmailProps }) {
  const [open, setOpen] = useState(false);

  const senderLabel = email.fromName
    ? `${email.fromName} <${email.fromEmail ?? ""}>`
    : (email.fromEmail ?? "—");
  const displayAttachments = email.attachments.filter(isDisplayAttachment);
  const renderedHtml = useMemo(() => {
    if (!email.bodyHtml) return null;
    return prepareEmailHtmlForDisplay(email.bodyHtml, email.attachments);
  }, [email.bodyHtml, email.attachments]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MailIcon />
        View original email
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full gap-0 data-[side=right]:sm:max-w-2xl"
        >
          <SheetHeader className="border-b pr-12">
            <SheetTitle className="truncate">
              {email.subject ?? "Original email"}
            </SheetTitle>
            <SheetDescription>Original email for this invoice</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-2 border-b px-4 py-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">From</dt>
                <dd className="min-w-0 break-words font-medium">{senderLabel}</dd>
                <dt className="text-muted-foreground">To</dt>
                <dd className="min-w-0 break-words">
                  {email.toEmails.length > 0 ? email.toEmails.join(", ") : "—"}
                </dd>
                {email.ccEmails.length > 0 ? (
                  <>
                    <dt className="text-muted-foreground">Cc</dt>
                    <dd className="min-w-0 break-words">{email.ccEmails.join(", ")}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Received</dt>
                <dd>{formatReceivedAt(email.receivedAt)}</dd>
              </dl>

              {displayAttachments.length > 0 ? (
                <ul className="flex flex-wrap items-center gap-1">
                  {displayAttachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a
                        href={`/api/inbox/attachments/${attachment.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-56 items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-xs transition-colors hover:bg-muted/60"
                        title={attachment.fileName}
                      >
                        <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{attachment.fileName}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}

              {email.threadId ? (
                <Link
                  href={`/inbox/${email.threadId}`}
                  className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-2"
                >
                  <MessagesSquareIcon className="size-3.5" />
                  Open conversation in inbox
                </Link>
              ) : null}
            </div>

            <div className="bg-white px-4 py-4 text-sm leading-relaxed text-foreground">
              {renderedHtml ? (
                <EmailMessageBody html={renderedHtml} />
              ) : email.bodyText ? (
                <p className="whitespace-pre-wrap break-words">{email.bodyText}</p>
              ) : (
                <p className="text-muted-foreground">No message body available.</p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
