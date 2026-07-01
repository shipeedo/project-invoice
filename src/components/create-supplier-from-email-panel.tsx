"use client";

import { useState } from "react";
import { Wand2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

type CreateSupplierMessage = {
  id: string;
  fromEmail: string | null;
  fromName: string | null;
};

type CreateSupplierFromEmailPanelProps = {
  message: CreateSupplierMessage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

function extractDomain(email: string | null | undefined) {
  if (!email) return "";
  return email.split("@")[1]?.toLowerCase() ?? "";
}

type CreateSupplierFormProps = {
  message: CreateSupplierMessage;
  onClose: () => void;
  onCreated: () => void;
};

function CreateSupplierForm({
  message,
  onClose,
  onCreated,
}: CreateSupplierFormProps) {
  const senderEmail = message.fromEmail?.trim().toLowerCase() ?? "";
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState(senderEmail);
  const [contactName, setContactName] = useState(message.fromName?.trim() ?? "");
  const [domain, setDomain] = useState(extractDomain(senderEmail));
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExtract() {
    setExtracting(true);
    setError(null);

    const response = await fetch(
      `/api/inbox/messages/${message.id}/extract-supplier`,
      { method: "POST" },
    );

    setExtracting(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Failed to extract supplier details");
      return;
    }

    const payload = (await response.json()) as {
      extracted: {
        company: string | null;
        senderEmail: string | null;
        contactName: string | null;
        domain: string | null;
      };
    };

    if (payload.extracted.company) {
      setCompany(payload.extracted.company);
    }
    if (payload.extracted.senderEmail) {
      setEmail(payload.extracted.senderEmail);
    }
    if (payload.extracted.contactName) {
      setContactName(payload.extracted.contactName);
    }
    if (payload.extracted.domain) {
      setDomain(payload.extracted.domain);
    } else if (payload.extracted.senderEmail) {
      setDomain(extractDomain(payload.extracted.senderEmail));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setError(null);

    const response = await fetch(
      `/api/inbox/messages/${message.id}/create-supplier`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: company,
          email,
          contactName: contactName || undefined,
          domain: domain || undefined,
        }),
      },
    );

    setSubmitting(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Failed to create supplier");
      return;
    }

    onClose();
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-6 px-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Supplier details</p>
        <Button
          type="button"
          variant="outline"
          disabled={extracting || submitting}
          onClick={() => void handleExtract()}
        >
          <Wand2Icon className="size-4" />
          Fill with AI
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="supplier-company">Company</Label>
          {extracting ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Input
              id="supplier-company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Supplier company name"
              required
              disabled={submitting}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="supplier-email">Email address</Label>
          {extracting ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Input
              id="supplier-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="billing@supplier.com"
              required
              disabled={submitting}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="supplier-domain">Domain</Label>
          {extracting ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Input
              id="supplier-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="supplier.com"
              disabled={submitting}
            />
          )}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="supplier-contact">Contact</Label>
          {extracting ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Input
              id="supplier-contact"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Person who sent this email"
              disabled={submitting}
            />
          )}
        </div>
      </div>

      <SheetFooter className="mt-auto px-0">
        <Button
          type="button"
          variant="outline"
          disabled={submitting || extracting}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || extracting}>
          {submitting ? "Creating supplier…" : "Create supplier"}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function CreateSupplierFromEmailPanel({
  message,
  open,
  onOpenChange,
  onCreated,
}: CreateSupplierFromEmailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Create supplier</SheetTitle>
          <SheetDescription>
            Set up a supplier from this email so future messages can be processed
            automatically.
          </SheetDescription>
        </SheetHeader>

        {message ? (
          <CreateSupplierForm
            key={message.id}
            message={message}
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
