"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CreditDraftFormProps = {
  invoiceId: string;
  defaultSubject: string;
};

export function CreditDraftForm({ invoiceId, defaultSubject }: CreditDraftFormProps) {
  const router = useRouter();
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [mailto, setMailto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMailto(null);

    const formData = new FormData();
    formData.append("subject", subject);
    formData.append("message", message);
    if (files) {
      Array.from(files).forEach((file, index) => {
        formData.append(`attachment${index}`, file);
      });
    }

    const response = await fetch(`/api/invoices/${invoiceId}/credit-draft`, {
      method: "POST",
      body: formData,
    });

    setLoading(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Failed to create credit draft");
      return;
    }

    const payload = (await response.json()) as { mailto: string };
    setMailto(payload.mailto);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit request draft</CardTitle>
        <CardDescription>
          Compose a message and attachments. The portal stores the draft and opens your mail client
          to review and send.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating draft..." : "Create draft email"}
            </Button>

            {mailto ? (
              <a href={mailto} className={cn(buttonVariants({ variant: "outline" }))}>
                Open in mail client
              </a>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
