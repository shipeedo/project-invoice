"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CarrierDecision, CreditRequestStatus } from "@/lib/db/types";

type CreditRequest = {
  id: string;
  status: CreditRequestStatus;
  carrierDecision: CarrierDecision | null;
  subject: string;
  recipientEmail: string;
  message: string;
  threadId: string | null;
  createdAt: Date | string;
};

type CreditRequestFormProps = {
  invoiceId: string;
  defaultSubject: string;
  defaultRecipient?: string | null;
  creditRequests: CreditRequest[];
};

function statusLabel(status: CreditRequestStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function CreditRequestForm({
  invoiceId,
  defaultSubject,
  defaultRecipient,
  creditRequests,
}: CreditRequestFormProps) {
  const router = useRouter();
  const [subject, setSubject] = useState(defaultSubject);
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipient ?? "");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("subject", subject);
    formData.append("recipientEmail", recipientEmail);
    formData.append("message", message);
    if (files) {
      Array.from(files).forEach((file, index) => {
        formData.append(`attachment${index}`, file);
      });
    }

    const response = await fetch(`/api/invoices/${invoiceId}/credit-request`, {
      method: "POST",
      body: formData,
    });

    setLoading(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Failed to send credit request");
      return;
    }

    setMessage("");
    setFiles(null);
    router.refresh();
  }

  async function handleAction(
    creditRequestId: string,
    action:
      | "carrier_approved"
      | "carrier_denied"
      | "approve"
      | "reject"
      | "contest",
  ) {
    setActionLoading(`${creditRequestId}:${action}`);
    setError(null);

    const response = await fetch(`/api/credit-requests/${creditRequestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    setActionLoading(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Failed to update credit request");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Credit request</CardTitle>
          <CardDescription>
            Send a credit request from the connected shared mailbox. Replies appear in
            the inbox thread linked to this invoice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="Carrier email address"
              type="email"
              required
            />
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Email subject"
            />
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Explain the credit required..."
              className="min-h-32"
              required
            />
            <Input
              type="file"
              multiple
              onChange={(event) => setFiles(event.target.files)}
            />
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send credit request"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {creditRequests.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Credit request threads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {creditRequests.map((request) => (
              <div key={request.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{request.subject}</p>
                  <Badge variant="secondary">{statusLabel(request.status)}</Badge>
                  {request.carrierDecision ? (
                    <Badge variant="outline">
                      Carrier {request.carrierDecision.toLowerCase()}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  To {request.recipientEmail}
                </p>
                <p className="text-sm whitespace-pre-wrap">{request.message}</p>
                {request.threadId ? (
                  <Link
                    href={`/inbox/${request.threadId}`}
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    View email thread
                  </Link>
                ) : null}

                {request.status === "AWAITING_USER" ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading !== null}
                      onClick={() => void handleAction(request.id, "carrier_approved")}
                    >
                      Carrier approved
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading !== null}
                      onClick={() => void handleAction(request.id, "carrier_denied")}
                    >
                      Carrier denied
                    </Button>
                  </div>
                ) : null}

                {request.status === "AWAITING_USER" &&
                request.carrierDecision === "APPROVED" ? (
                  <Button
                    size="sm"
                    disabled={actionLoading !== null}
                    onClick={() => void handleAction(request.id, "approve")}
                  >
                    Approve credit
                  </Button>
                ) : null}

                {request.status === "AWAITING_USER" ? (
                  <div className="flex flex-wrap gap-2">
                    {request.carrierDecision === "DENIED" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionLoading !== null}
                          onClick={() => void handleAction(request.id, "contest")}
                        >
                          Contest decision
                        </Button>
                        {request.threadId ? (
                          <Link
                            href={`/inbox/${request.threadId}`}
                            className={cn(
                              "inline-flex h-7 items-center rounded-md border px-2.5 text-sm",
                            )}
                          >
                            Reply with detail
                          </Link>
                        ) : null}
                      </>
                    ) : null}
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actionLoading !== null}
                      onClick={() => void handleAction(request.id, "reject")}
                    >
                      Mark rejected
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
