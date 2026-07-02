"use client";

import { useState } from "react";
import {
  Building2Icon,
  CheckIcon,
  GlobeIcon,
  MailIcon,
  PencilIcon,
  SparklesIcon,
  UserIcon,
  Wand2Icon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

type CreateSupplierMessage = {
  id: string;
  fromEmail: string | null;
  fromName: string | null;
};

type SupplierCandidate = {
  company: string | null;
  senderEmail: string | null;
  contactName: string | null;
  domain: string | null;
  label: string;
  source: string;
  confidence: "high" | "medium" | "low";
  reasoning: string | null;
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

function formatSource(source: string) {
  return source.replaceAll("_", " ");
}

function confidenceBadgeVariant(
  confidence: SupplierCandidate["confidence"],
): "default" | "secondary" | "outline" {
  if (confidence === "high") return "default";
  if (confidence === "medium") return "secondary";
  return "outline";
}

type SupplierCandidateDetailProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
};

function SupplierCandidateDetail({
  icon,
  label,
  value,
}: SupplierCandidateDetailProps) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="text-sm leading-snug wrap-break-word">{value}</p>
      </div>
    </div>
  );
}

type SupplierCandidateCardProps = {
  candidate: SupplierCandidate;
  selected: boolean;
  onSelect: () => void;
  onModify: () => void;
};

function SupplierCandidateCard({
  candidate,
  selected,
  onSelect,
  onModify,
}: SupplierCandidateCardProps) {
  const details: SupplierCandidateDetailProps[] = [];

  if (candidate.senderEmail) {
    details.push({
      icon: <MailIcon className="size-3.5" />,
      label: "Email",
      value: candidate.senderEmail,
    });
  }
  if (candidate.contactName) {
    details.push({
      icon: <UserIcon className="size-3.5" />,
      label: "Contact",
      value: candidate.contactName,
    });
  }
  if (candidate.domain) {
    details.push({
      icon: <GlobeIcon className="size-3.5" />,
      label: "Domain",
      value: candidate.domain,
    });
  }
  details.push({
    icon: <SparklesIcon className="size-3.5" />,
    label: "Source",
    value: formatSource(candidate.source),
  });

  return (
    <Card
      size="sm"
      className={cn(
        "cursor-pointer transition-all hover:bg-muted/30",
        selected
          ? "border-primary/40 bg-primary/5 ring-2 ring-primary shadow-sm"
          : "hover:border-muted-foreground/20",
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <CardHeader className="pb-0">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/30 bg-background text-transparent",
            )}
            aria-hidden
          >
            <CheckIcon className="size-3" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-base leading-snug">
              {candidate.company ?? candidate.label}
            </CardTitle>
            {candidate.company && candidate.label !== candidate.company ? (
              <p className="text-sm text-muted-foreground">{candidate.label}</p>
            ) : null}
          </div>
        </div>
        <CardAction>
          <Badge variant={confidenceBadgeVariant(candidate.confidence)}>
            {candidate.confidence} confidence
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4 pt-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {details.map((detail) => (
            <SupplierCandidateDetail key={detail.label} {...detail} />
          ))}
        </div>

        {candidate.reasoning ? (
          <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Building2Icon className="size-3.5" />
              Why this match
            </div>
            <p className="text-sm leading-relaxed text-foreground/90">
              {candidate.reasoning}
            </p>
          </div>
        ) : null}
      </CardContent>

      {selected ? (
        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onModify();
            }}
          >
            <PencilIcon className="size-3.5" />
            Modify details
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
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
