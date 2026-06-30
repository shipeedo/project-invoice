"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-base font-semibold">Credit request draft</h3>
        <p className="mt-1 text-sm text-slate-600">
          Compose a message and attachments. The portal stores the draft and opens your mail client to review and send.
        </p>
      </div>

      <input
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Email subject"
      />

      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        className="min-h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Explain the credit required..."
        required
      />

      <input
        type="file"
        multiple
        onChange={(event) => setFiles(event.target.files)}
        className="block w-full text-sm"
      />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Creating draft..." : "Create draft email"}
      </button>

      {mailto ? (
        <a
          href={mailto}
          className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
        >
          Open in mail client
        </a>
      ) : null}
    </form>
  );
}
