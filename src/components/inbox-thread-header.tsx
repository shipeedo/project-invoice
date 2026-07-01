"use client";

import Link from "next/link";
import { FileTextIcon, PaperclipIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { ThreadAttachment } from "@/components/inbox-thread-attachments";
import { cn } from "@/lib/utils";

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

function invoiceLabel(invoice: LinkedInvoice) {
  return invoice.vendorName ?? invoice.originalFileName ?? "Invoice";
}

export function InboxThreadHeader({
  subject,
  messageCount,
  attachments,
  linkedInvoices,
}: InboxThreadHeaderProps) {
  return (
    <header className="shrink-0 border-b px-4 py-2.5">
      <h3 className="truncate text-base font-semibold leading-snug">
        {subject ?? "(No subject)"}
      </h3>

      {linkedInvoices.length > 0 ? (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-xs font-medium text-emerald-900">
            Linked invoice{linkedInvoices.length === 1 ? "" : "s"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {linkedInvoices.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.id}`}
                className={cn(buttonVariants(), "h-8")}
              >
                <FileTextIcon />
                View linked invoice
                <span className="font-normal opacity-90">· {invoiceLabel(invoice)}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {(messageCount > 0 || attachments.length > 0) && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1",
            linkedInvoices.length > 0 ? "mt-2" : "mt-1.5",
          )}
        >
          <span className="text-xs text-muted-foreground">
            {messageCount} message{messageCount === 1 ? "" : "s"}
          </span>
          {attachments.length > 0 ? (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
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
      )}
    </header>
  );
}
