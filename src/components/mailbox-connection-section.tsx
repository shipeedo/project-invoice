"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRightIcon,
  MailIcon,
  PlusIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import {
  AppleLogo,
  ExchangeLogo,
  GmailLogo,
  MicrosoftLogo,
  YahooLogo,
} from "@/components/provider-logos";
import { SectionStatusBadge } from "@/components/section-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Provider = {
  id: string;
  name: string;
  description: string;
  logo: React.ReactNode;
  href?: string;
  available: boolean;
};

// Office 365 is the only provider we can connect today. The rest are listed so
// the roadmap is visible, but they stay disabled until we build the integration.
const PROVIDERS: Provider[] = [
  {
    id: "office365",
    name: "Microsoft Office 365",
    description: "Import supplier invoices from a shared Outlook mailbox.",
    logo: <MicrosoftLogo className="size-5" />,
    href: "/admin/o365",
    available: true,
  },
  {
    id: "gmail",
    name: "Gmail / Google Workspace",
    description: "Connect a Google Workspace mailbox.",
    logo: <GmailLogo className="size-5" />,
    available: false,
  },
  {
    id: "icloud",
    name: "iCloud Mail",
    description: "Connect an Apple iCloud mailbox.",
    logo: <AppleLogo className="size-5 text-foreground" />,
    available: false,
  },
  {
    id: "exchange",
    name: "Microsoft Exchange (self-hosted)",
    description: "Connect a self-hosted Exchange mailbox.",
    logo: <ExchangeLogo className="size-5" />,
    available: false,
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    description: "Connect a Yahoo mailbox.",
    logo: <YahooLogo className="size-5" />,
    available: false,
  },
  {
    id: "imap",
    name: "IMAP / SMTP",
    description: "Connect any mailbox that supports IMAP.",
    logo: <MailIcon className="size-5 text-muted-foreground" />,
    available: false,
  },
];

type MailboxConnectionSectionProps = {
  connected: boolean;
  mailboxEmail: string | null;
  lastSyncedLabel: string | null;
};

export function MailboxConnectionSection({
  connected,
  mailboxEmail,
  lastSyncedLabel,
}: MailboxConnectionSectionProps) {
  const [choosing, setChoosing] = useState(false);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          Mailbox
          <SectionStatusBadge status={connected ? "ready" : "attention"}>
            {connected ? "Connected" : "Not connected"}
          </SectionStatusBadge>
        </CardTitle>
        <CardDescription>
          Import supplier invoices automatically from a shared mailbox.
        </CardDescription>
        <CardAction>
          {connected ? (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/admin/o365" />}
            >
              <Settings2Icon />
              Manage
            </Button>
          ) : choosing ? (
            <Button size="sm" variant="ghost" onClick={() => setChoosing(false)}>
              <XIcon />
              Cancel
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        {connected ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-border/60">
              <MicrosoftLogo className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{mailboxEmail}</p>
              <p className="text-sm text-muted-foreground">
                Microsoft Office 365
                {lastSyncedLabel ? ` · Synced ${lastSyncedLabel}` : ""}
              </p>
            </div>
          </div>
        ) : choosing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {PROVIDERS.map((provider) => (
              <ProviderTile key={provider.id} provider={provider} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <MailIcon className="size-5 text-muted-foreground" />
            </span>
            <div>
              <p className="font-medium">No mailbox connected</p>
              <p className="text-sm text-muted-foreground">
                Connect a mailbox so invoice emails are imported for everyone.
              </p>
            </div>
            <Button size="sm" onClick={() => setChoosing(true)}>
              <PlusIcon />
              Add a mailbox
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderTile({ provider }: { provider: Provider }) {
  const tile = (
    <div
      className={cn(
        "h-full rounded-lg border p-4 transition-colors",
        provider.available ? "hover:border-primary/50" : "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center">
            {provider.logo}
          </span>
          <p className="truncate text-sm font-medium">{provider.name}</p>
        </div>
        {provider.available ? (
          <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Badge variant="secondary" className="shrink-0">
            Coming soon
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {provider.description}
      </p>
    </div>
  );

  if (provider.available && provider.href) {
    return (
      <Link
        href={provider.href}
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {tile}
      </Link>
    );
  }

  return (
    <div aria-disabled className="cursor-not-allowed">
      {tile}
    </div>
  );
}
