"use client";

import Link from "next/link";
import { FileTextIcon, PaperclipIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  supplier: { id: string; name: string } | null;
  attachments: ThreadAttachment[];
  linkedInvoices: LinkedInvoice[];
};

function invoiceLabel(invoice: LinkedInvoice) {
  const name = invoice.vendorName ?? invoice.originalFileName;
  if (!name) return "Invoice";
  return name.length > 28 ? `${name.slice(0, 25)}…` : name;
}

export function InboxThreadHeader({
  subject,
  messageCount,
  supplier,
  attachments,
  linkedInvoices,
}: InboxThreadHeaderProps) {
  return (
    <header className="shrink-0 border-b px-4 py-2.5">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold leading-snug">
          {subject ?? "(No subject)"}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {linkedInvoices.map((invoice) => (
            <Link
              key={invoice.id}
              href={`/invoices/${invoice.id}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "xs" }),
                "max-w-36",
              )}
              title={`Open invoice: ${invoiceLabel(invoice)}`}
            >
              <FileTextIcon />
              <span className="truncate">{invoiceLabel(invoice)}</span>
            </Link>
          ))}
          {supplier ? (
            <Badge className="max-w-40 truncate border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
              {supplier.name}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-muted-foreground/30 bg-muted text-muted-foreground"
            >
              No supplier
            </Badge>
          )}
        </div>
      </div>

      {(messageCount > 0 || attachments.length > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
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
