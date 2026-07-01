"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CreateSupplierFromEmailPanel } from "@/components/create-supplier-from-email-panel";
import {
  InboxConversationMessage,
  type ConversationMessage,
} from "@/components/inbox-conversation-message";
import { InboxThreadHeader } from "@/components/inbox-thread-header";
import { collectThreadAttachments } from "@/components/inbox-thread-attachments";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type InboxThreadViewProps = {
  threadId: string;
  subject: string | null;
  messages: ConversationMessage[];
};

export function InboxThreadView({
  threadId,
  subject,
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
      <InboxThreadHeader
        subject={subject}
        messageCount={messages.length}
        attachments={threadAttachments}
        linkedInvoices={linkedInvoices}
      />

      {error ? (
        <Alert variant="destructive" className="mx-4 mt-3 py-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-3">
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
                onCreateSupplier={openCreateSupplierPanel}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t bg-muted/10 px-4 py-3">
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
