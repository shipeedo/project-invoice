"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

function formatMessageDate(value: Date | string | null) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

type ThreadMessage = {
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

type InboxThreadViewProps = {
  threadId: string;
  subject: string | null;
  supplier: { id: string; name: string } | null;
  messages: ThreadMessage[];
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
  const [creatingSupplierFor, setCreatingSupplierFor] = useState<string | null>(
    null,
  );

  const hasUnknownSender = messages.some(
    (message) => message.direction === "INBOUND" && !message.supplierId,
  );

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

  async function handleCreateSupplier(messageId: string, fromName: string | null) {
    setCreatingSupplierFor(messageId);
    setError(null);

    const response = await fetch(
      `/api/inbox/messages/${messageId}/create-supplier`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fromName ?? undefined }),
      },
    );

    setCreatingSupplierFor(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Failed to create supplier");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">{subject ?? "(No subject)"}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </p>
          </div>
          {supplier ? (
            <Badge variant="secondary">Supplier: {supplier.name}</Badge>
          ) : (
            <Badge variant="outline">Unknown sender</Badge>
          )}
        </div>
      </header>

      {error ? (
        <Alert variant="destructive" className="mx-6 mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {hasUnknownSender ? (
        <Alert className="mx-6 mt-4">
          <AlertDescription>
            This sender is not linked to a supplier yet. Create a supplier to enable
            automatic invoice processing for future emails from this address.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-6">
          {messages.map((message, index) => (
            <article key={message.id}>
              {index > 0 ? <Separator className="mb-6" /> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {message.fromName
                      ? `${message.fromName} <${message.fromEmail}>`
                      : (message.fromEmail ?? "Unknown sender")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMessageDate(message.receivedAt)}
                  </p>
                </div>
                <Badge variant="outline">{message.direction.toLowerCase()}</Badge>
              </div>

              <div className="mt-4 text-sm leading-relaxed">
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

              {message.attachments.length > 0 ? (
                <ul className="mt-4 space-y-1 rounded-lg border bg-muted/20 p-3 text-sm">
                  {message.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a
                        href={`/api/inbox/attachments/${attachment.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {attachment.fileName}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}

              {message.invoice ? (
                <p className="mt-3 text-sm">
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
                  disabled={creatingSupplierFor === message.id}
                  onClick={() =>
                    void handleCreateSupplier(message.id, message.fromName)
                  }
                >
                  {creatingSupplierFor === message.id
                    ? "Creating supplier…"
                    : "Create supplier from this email"}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
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
    </div>
  );
}
