"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold">{subject ?? "(No subject)"}</h2>
        {supplier ? (
          <Badge variant="secondary">Supplier: {supplier.name}</Badge>
        ) : (
          <Badge variant="outline">Unlinked sender</Badge>
        )}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-4">
        {messages.map((message) => (
          <Card key={message.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {message.fromName
                    ? `${message.fromName} <${message.fromEmail}>`
                    : (message.fromEmail ?? "Unknown sender")}
                </CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{message.direction.toLowerCase()}</Badge>
                  {formatMessageDate(message.receivedAt)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {message.bodyText ? (
                <p className="whitespace-pre-wrap text-sm">{message.bodyText}</p>
              ) : message.bodyHtml ? (
                <div
                  className="prose prose-sm max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No message body.</p>
              )}

              {message.attachments.length > 0 ? (
                <ul className="space-y-1 text-sm">
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
                <Link
                  href={`/invoices/${message.invoice.id}`}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Linked invoice:{" "}
                  {message.invoice.vendorName ??
                    message.invoice.originalFileName ??
                    message.invoice.id}
                </Link>
              ) : null}

              {message.direction === "INBOUND" && !message.supplierId ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={creatingSupplierFor === message.id}
                  onClick={() =>
                    void handleCreateSupplier(message.id, message.fromName)
                  }
                >
                  {creatingSupplierFor === message.id
                    ? "Creating supplier…"
                    : "Create supplier from email"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reply</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReply} className="space-y-4">
            <Textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Write your reply..."
              className="min-h-28"
              required
            />
            <Input
              type="file"
              multiple
              onChange={(event) => setFiles(event.target.files)}
            />
            <Button type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send reply"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Link href="/inbox" className={cn(buttonVariants({ variant: "outline" }))}>
        Back to inbox
      </Link>
    </div>
  );
}
