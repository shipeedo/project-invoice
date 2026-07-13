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
import {
  extractDomain,
  SupplierCandidateCard,
  type SupplierCandidate,
} from "@/components/supplier-candidate";

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

function applyCandidateToForm(
  candidate: SupplierCandidate,
  setters: {
    setCompany: (value: string) => void;
    setEmail: (value: string) => void;
    setContactName: (value: string) => void;
    setDomain: (value: string) => void;
  },
) {
  if (candidate.company) {
    setters.setCompany(candidate.company);
  }
  if (candidate.senderEmail) {
    setters.setEmail(candidate.senderEmail);
  }
  if (candidate.contactName) {
    setters.setContactName(candidate.contactName);
  }
  if (candidate.domain) {
    setters.setDomain(candidate.domain);
  } else if (candidate.senderEmail) {
    setters.setDomain(extractDomain(candidate.senderEmail));
  }
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
  const [candidates, setCandidates] = useState<SupplierCandidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(
    null,
  );
  const [isModifying, setIsModifying] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inSelectionMode = candidates.length > 0 && !isModifying;
  const showForm = !extracting && !inSelectionMode;

  function selectCandidate(candidate: SupplierCandidate, index: number) {
    setSelectedCandidateIndex(index);
    setIsModifying(false);
    applyCandidateToForm(candidate, {
      setCompany,
      setEmail,
      setContactName,
      setDomain,
    });
  }

  async function handleExtract() {
    setExtracting(true);
    setError(null);
    setCandidates([]);
    setSelectedCandidateIndex(null);
    setIsModifying(false);

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
      candidates: SupplierCandidate[];
      recommendedIndex: number;
      extracted: {
        company: string | null;
        senderEmail: string | null;
        contactName: string | null;
        domain: string | null;
      };
    };

    const nextCandidates = payload.candidates ?? [];
    setCandidates(nextCandidates);

    if (nextCandidates.length > 0) {
      const recommendedIndex =
        payload.recommendedIndex >= 0 && payload.recommendedIndex < nextCandidates.length
          ? payload.recommendedIndex
          : 0;
      selectCandidate(nextCandidates[recommendedIndex], recommendedIndex);
      return;
    }

    applyCandidateToForm(
      {
        ...payload.extracted,
        label: payload.extracted.company ?? "Supplier",
        source: "other",
        confidence: "medium",
        reasoning: null,
      },
      { setCompany, setEmail, setContactName, setDomain },
    );
    setCandidates([
      {
        ...payload.extracted,
        label: payload.extracted.company ?? "Supplier",
        source: "other",
        confidence: "medium",
        reasoning: null,
      },
    ]);
    setSelectedCandidateIndex(0);
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

      {extracting ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reviewing the full email thread for supplier matches…
          </p>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {!extracting && inSelectionMode ? (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">
              {candidates.length > 1 ? "Choose a supplier match" : "Suggested supplier"}
            </p>
            <p className="text-sm text-muted-foreground">
              {candidates.length > 1
                ? "AI found multiple organisations in this thread. Select the one you want to create."
                : "Review the suggested supplier, or modify the details before creating."}
            </p>
          </div>
          <div className="grid gap-3">
            {candidates.map((candidate, index) => {
              const selected = selectedCandidateIndex === index;
              return (
                <SupplierCandidateCard
                  key={`${candidate.label}-${index}`}
                  candidate={candidate}
                  selected={selected}
                  onSelect={() => selectCandidate(candidate, index)}
                  onModify={() => {
                    applyCandidateToForm(candidate, {
                      setCompany,
                      setEmail,
                      setContactName,
                      setDomain,
                    });
                    setIsModifying(true);
                  }}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="supplier-company">Company</Label>
            <Input
              id="supplier-company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Supplier company name"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-email">Email address</Label>
            <Input
              id="supplier-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="billing@supplier.com"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-domain">Domain</Label>
            <Input
              id="supplier-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="supplier.com"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="supplier-contact">Contact</Label>
            <Input
              id="supplier-contact"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Person who sent this email"
              disabled={submitting}
            />
          </div>
        </div>
      ) : null}

      <SheetFooter className="mt-auto px-0">
        <Button
          type="button"
          variant="outline"
          disabled={submitting || extracting}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            submitting ||
            extracting ||
            !company.trim() ||
            !email.trim() ||
            (inSelectionMode && selectedCandidateIndex === null)
          }
        >
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
            Set up a supplier from this email thread so future messages can be processed
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
