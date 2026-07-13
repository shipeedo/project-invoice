import Link from "next/link";
import { ArrowRightIcon, CheckCircle2Icon, MailIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  AppleLogo,
  ExchangeLogo,
  GmailLogo,
  MicrosoftLogo,
  YahooLogo,
} from "@/components/provider-logos";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getO365Connection } from "@/lib/o365/connection";
import { getNavCounts } from "@/lib/nav-counts";
import { requireRole } from "@/lib/session";
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

export default async function ConnectionsPage() {
  const session = await requireRole(["ADMIN"]);
  const [connection, navCounts] = await Promise.all([
    getO365Connection(session.user.organizationId),
    getNavCounts(session.user.organizationId, session.user.id),
  ]);

  const o365Connected =
    connection?.status === "CONNECTED" && !!connection.selectedMailboxUpn;

  return (
    <AppShell
      user={session.user}
      activePath="/admin/connections"
      navCounts={navCounts}
      breadcrumbs={[{ label: "Admin" }, { label: "Connections" }]}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Connections</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a mailbox so invoice emails are imported automatically for
            everyone in your organization.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {PROVIDERS.map((provider) => {
            const connected = provider.id === "office365" && o365Connected;
            const card = (
              <Card
                className={cn(
                  "h-full transition-colors",
                  provider.available
                    ? "hover:border-primary/50"
                    : "opacity-60",
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 shrink-0 items-center justify-center">
                        {provider.logo}
                      </span>
                      <CardTitle className="text-base">
                        {provider.name}
                      </CardTitle>
                    </div>
                    {connected ? (
                      <Badge className="gap-1">
                        <CheckCircle2Icon className="size-3.5" />
                        Connected
                      </Badge>
                    ) : provider.available ? (
                      <ArrowRightIcon className="size-4 text-muted-foreground" />
                    ) : (
                      <Badge variant="secondary">Coming soon</Badge>
                    )}
                  </div>
                  <CardDescription>{provider.description}</CardDescription>
                </CardHeader>
                {connected ? (
                  <CardContent className="pt-0 text-sm text-muted-foreground">
                    Monitoring{" "}
                    <span className="font-medium text-foreground">
                      {connection?.selectedMailboxUpn}
                    </span>
                  </CardContent>
                ) : null}
              </Card>
            );

            if (provider.available && provider.href) {
              return (
                <Link
                  key={provider.id}
                  href={provider.href}
                  className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {card}
                </Link>
              );
            }

            return (
              <div key={provider.id} aria-disabled className="cursor-not-allowed">
                {card}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
