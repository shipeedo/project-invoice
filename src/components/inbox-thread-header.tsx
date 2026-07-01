"use client";

import Link from "next/link";
import { FileTextIcon, PaperclipIcon } from "lucide-react";
import type { ThreadAttachment } from "@/components/inbox-thread-attachments";

type LinkedInvoice = {
  id: string;
  vendorName: string | null;
  originalFileName: string | null;
};

type InboxThreadHeaderProps = {
  subject: string | null;
  messageCount: number;
  attachments: ThreadAttachment[];
  linkedInvoices: LinkedInvoice[];
};

function invoiceChipLabel(invoice: LinkedInvoice) {
  const raw = invoice.originalFileName ?? invoice.vendorName;
  if (raw) {
    return raw.replace(/\.[^.]+$/, "");
  }
  return `invoice_${invoice.id.slice(-6)}`;
}

export function InboxThreadHeader({
  subject,
  messageCount,
  attachments,
  linkedInvoices,
}: InboxThreadHeaderProps) {
  const hasMeta =
    messageCount > 0 || attachments.length > 0 || linkedInvoices.length > 0;

  return (
    <header className="shrink-0 border-b px-4 py-2.5">
      <h3 className="truncate text-base font-semibold leading-snug">
        {subject ?? "(No subject)"}
      </h3>

      {hasMeta ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {messageCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {messageCount} message{messageCount === 1 ? "" : "s"}
            </span>
          ) : null}

          {linkedInvoices.length > 0 ? (
            <>
              {messageCount > 0 ? (
                <span className="text-xs text-muted-foreground">·</span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {linkedInvoices.length} linked invoice
                {linkedInvoices.length === 1 ? "" : "s"}
              </span>
              <ul className="flex flex-wrap items-center gap-1">
                {linkedInvoices.map((invoice) => (
                  <li key={invoice.id}>
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="inline-flex max-w-48 items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-xs transition-colors hover:bg-muted/60"
                      title={invoiceChipLabel(invoice)}
                    >
                      <FileTextIcon className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{invoiceChipLabel(invoice)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {attachments.length > 0 ? (
            <>
              {messageCount > 0 || linkedInvoices.length > 0 ? (
                <span className="text-xs text-muted-foreground">·</span>
              ) : null}
              <ul className="flex min-w-0 flex-wrap items-center gap-1">
                {attachments.map((attachment) => (
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
            </>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
