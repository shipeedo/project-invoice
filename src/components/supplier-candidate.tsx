"use client";

import {
  Building2Icon,
  CheckIcon,
  GlobeIcon,
  MailIcon,
  PencilIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

export type SupplierCandidate = {
  company: string | null;
  senderEmail: string | null;
  contactName: string | null;
  domain: string | null;
  label: string;
  source: string;
  confidence: "high" | "medium" | "low";
  reasoning: string | null;
};

export function extractDomain(email: string | null | undefined) {
  if (!email) return "";
  return email.split("@")[1]?.toLowerCase() ?? "";
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

export function SupplierCandidateCard({
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
        "min-w-0 cursor-pointer transition-all hover:bg-muted/30",
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
            <CardTitle className="text-base leading-snug wrap-break-word">
              {candidate.company ?? candidate.label}
            </CardTitle>
            {candidate.company && candidate.label !== candidate.company ? (
              <p className="text-sm text-muted-foreground wrap-break-word">
                {candidate.label}
              </p>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
