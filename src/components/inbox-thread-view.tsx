"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileTextIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CreateSupplierFromEmailPanel } from "@/components/create-supplier-from-email-panel";
import {
  InboxConversationMessage,
  type ConversationMessage,
} from "@/components/inbox-conversation-message";
import {
  collectThreadAttachments,
  InboxThreadAttachments,
} from "@/components/inbox-thread-attachments";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type InboxThreadViewProps = {
  threadId: string;
  subject: string | null;
  supplier: { id: string; name: string } | null;
  messages: ConversationMessage[];
};

export function InboxThreadView({
  threadId,
  subject,
  supplier,
  messages,
}: InboxThreadViewProps) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createSupplierMessage, setCreateSupplierMessage] =
    useState<ConversationMessage | null>(null);
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false);

  const threadAttachments = useMemo(
    () => collectThreadAttachments(messages),
    [messages],
  );

  const linkedInvoices = useMemo(() => {
    const seen = new Map<
      string,
      NonNullable<ConversationMessage["invoice"]>
    >();
    for (const message of messages) {
      if (message.invoice && !seen.has(message.invoice.id)) {
        seen.set(message.invoice.id, message.invoice);
      }
    }
    return Array.from(seen.values());
  }, [messages]);

  const hasUnknownSender = !supplier;

  async function handleReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("message", reply);
    if (files) {
      Array.from(files).forEach((file, index) => {
        formData.append(`attachment${index}`, file);
      });
    }

    const response = await fetch(`/api/inbox/${threadId}/reply`, {
      method: "POST",
      body: formData,
    });

    setLoading(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Failed to send reply");
      return;
    }

    setReply("");
    setFiles(null);
    router.refresh();
  }

  function openCreateSupplierPanel(message: ConversationMessage) {
    setError(null);
    setCreateSupplierMessage(message);
    setCreateSupplierOpen(true);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        className={cn(
          "shrink-0 border-b px-6 py-4",
          supplier
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-border bg-muted/40",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">{subject ?? "(No subject)"}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {messages.length} message{messages.length === 1 ? "" : "s"} in this
              conversation
            </p>
          </div>
          {supplier ? (
            <Badge className="border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
              Supplier linked: {supplier.name}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-muted-foreground/30 bg-muted text-muted-foreground"
            >
              No supplier linked
            </Badge>
          )}
        </div>

        {linkedInvoices.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {linkedInvoices.map((invoice) => {
              const label =
                invoice.vendorName ??
                invoice.originalFileName ??
                invoice.id;
              return (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className={cn(buttonVariants(), "h-9 px-4")}
                >
                  <FileTextIcon className="size-4" />
                  View linked invoice
                  <span className="font-normal opacity-80">· {label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </header>

      <InboxThreadAttachments attachments={threadAttachments} />

      {error ? (
        <Alert variant="destructive" className="mx-6 mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {hasUnknownSender ? (
        <Alert className="mx-6 mt-4 border-muted-foreground/20 bg-muted/50">
          <AlertDescription className="text-muted-foreground">
            This conversation is not linked to a supplier yet. Create a supplier to
            enable automatic invoice processing for future emails from this address.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages in this conversation.</p>
        ) : (
          <div className="w-full min-w-0">
            {messages.map((message, index) => (
              <InboxConversationMessage
                key={message.id}
                message={message}
                index={index}
                total={messages.length}
                threadHasSupplier={Boolean(supplier)}
                onCreateSupplier={openCreateSupplierPanel}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t bg-muted/10 px-6 py-4">
        <form onSubmit={handleReply} className="space-y-3">
          <Textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder="Write your reply…"
            className="min-h-24 bg-background"
            required
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Input
              type="file"
              multiple
              className="max-w-sm bg-background"
              onChange={(event) => setFiles(event.target.files)}
            />
            <Button type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send reply"}
            </Button>
          </div>
        </form>
      </footer>

      <CreateSupplierFromEmailPanel
        message={createSupplierMessage}
        open={createSupplierOpen}
        onOpenChange={setCreateSupplierOpen}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
