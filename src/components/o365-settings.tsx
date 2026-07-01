"use client";

import {
  CheckIcon,
  MailIcon,
  RefreshCwIcon,
  UnplugIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type O365Status = {
  configured: boolean;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  mailboxUpn: string | null;
  mailboxId: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  microsoftTenantId: string | null;
};

type Mailbox = {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
};

type O365SettingsProps = {
  initialStatus: O365Status;
  initialMailboxes: Mailbox[];
  connected?: boolean;
  errorMessage?: string | null;
};

function statusVariant(status: O365Status["status"]) {
  if (status === "CONNECTED") return "default" as const;
  if (status === "ERROR") return "destructive" as const;
  return "secondary" as const;
}

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function mailboxAddress(mailbox: Mailbox) {
  return mailbox.mail || mailbox.userPrincipalName;
}

export function O365Settings({
  initialStatus,
  initialMailboxes,
  connected,
  errorMessage,
}: O365SettingsProps) {
  const [status, setStatus] = useState(initialStatus);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>(initialMailboxes);
  const [selectedMailbox, setSelectedMailbox] = useState<Mailbox | null>(() => {
    if (!initialStatus.mailboxId) return null;
    return (
      initialMailboxes.find((entry) => entry.id === initialStatus.mailboxId) ?? {
        id: initialStatus.mailboxId,
        displayName: initialStatus.mailboxUpn ?? "Selected mailbox",
        mail: initialStatus.mailboxUpn ?? "",
        userPrincipalName: initialStatus.mailboxUpn ?? "",
      }
    );
  });
  const [loadingMailboxes, setLoadingMailboxes] = useState(false);
  const [savingMailbox, setSavingMailbox] = useState(false);
  const [polling, setPolling] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(
    connected ? "Office 365 connected successfully." : errorMessage ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/admin/o365/status");
    if (!response.ok) return;
    const data = (await response.json()) as O365Status;
    setStatus(data);
    if (data.mailboxId && data.mailboxUpn) {
      setSelectedMailbox((current) =>
        current?.id === data.mailboxId
          ? current
          : {
              id: data.mailboxId!,
              displayName: data.mailboxUpn!,
              mail: data.mailboxUpn!,
              userPrincipalName: data.mailboxUpn!,
            },
      );
    }
  }, []);

  const loadMailboxes = useCallback(async () => {
    setLoadingMailboxes(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/o365/mailboxes");
      const data = (await response.json()) as {
        mailboxes?: Mailbox[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load mailboxes");
      }
      setMailboxes(data.mailboxes ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load mailboxes",
      );
    } finally {
      setLoadingMailboxes(false);
    }
  }, []);

  // Fetch accessible mailboxes when O365 is connected (client-side; can take a moment).
  useEffect(() => {
    if (status.status === "CONNECTED") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount fetch
      void loadMailboxes();
    }
  }, [status.status, loadMailboxes]);

  async function handleSaveMailbox() {
    if (!selectedMailbox) {
      setError("Select a mailbox from the list");
      return;
    }

    setSavingMailbox(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/o365/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxId: selectedMailbox.id,
          mailboxUpn: mailboxAddress(selectedMailbox),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save mailbox");
      }
      setMessage(`Now monitoring ${mailboxAddress(selectedMailbox)}.`);
      await refreshStatus();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save mailbox",
      );
    } finally {
      setSavingMailbox(false);
    }
  }

  async function handlePollNow() {
    setPolling(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/o365/poll", { method: "POST" });
      const data = (await response.json()) as {
        synced?: number;
        skipped?: number;
        invoicesProcessed?: number;
        processed?: number;
        errors?: string[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Polling failed");
      }
      setMessage(
        (data.synced ?? 0) > 0 || (data.skipped ?? 0) > 0
          ? `Sync complete — imported ${data.synced ?? 0} new emails${(data.skipped ?? 0) > 0 ? ` (${data.skipped} already synced)` : ""}, processed ${data.invoicesProcessed ?? 0} invoices.`
          : "Sync complete — no new emails found in the latest batch.",
      );
      if (data.errors?.length) {
        setError(data.errors.join("; "));
      }
      await refreshStatus();
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : "Polling failed");
    } finally {
      setPolling(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/o365/disconnect", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to disconnect");
      }
      setMailboxes([]);
      setSelectedMailbox(null);
      setMessage("Office 365 disconnected.");
      await refreshStatus();
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Failed to disconnect",
      );
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailIcon className="size-5" />
            Connection
          </CardTitle>
          <CardDescription>
            Connect Microsoft 365, then choose which shared mailbox receives supplier
            invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status.configured ? (
            <Alert variant="destructive">
              <AlertDescription>
                Microsoft OAuth is not configured. Set MS_CLIENT_ID and
                MS_CLIENT_SECRET to enable the connect flow.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={statusVariant(status.status)}>{status.status}</Badge>
            {status.mailboxUpn ? (
              <span className="text-sm text-muted-foreground">
                Monitoring <strong>{status.mailboxUpn}</strong>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                No mailbox selected yet
              </span>
            )}
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Connected at</dt>
              <dd>{formatTimestamp(status.connectedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last synced</dt>
              <dd>{formatTimestamp(status.lastSyncedAt)}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            {status.status !== "CONNECTED" ? (
              status.configured ? (
                <a href="/api/o365/connect" className={cn(buttonVariants())}>
                  Connect Office 365
                </a>
              ) : (
                <Button disabled>Connect Office 365</Button>
              )
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => void handlePollNow()}
                  disabled={polling || !status.mailboxUpn}
                >
                  <RefreshCwIcon className="size-4" />
                  {polling ? "Syncing…" : "Sync mailbox now"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleDisconnect()}
                  disabled={disconnecting}
                >
                  <UnplugIcon className="size-4" />
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {status.status === "CONNECTED" ? (
        <Card>
          <CardHeader>
            <CardTitle>Invoice mailbox</CardTitle>
            <CardDescription>
              Choose a mailbox your account can read. Only mailboxes you have access
              to are listed (typically shared mailboxes with Full Access in Exchange).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status.mailboxUpn ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                <p className="font-medium">Currently monitoring</p>
                <p className="mt-1 text-muted-foreground">{status.mailboxUpn}</p>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {loadingMailboxes
                  ? "Loading accessible mailboxes…"
                  : `${mailboxes.length} accessible mailbox${mailboxes.length === 1 ? "" : "es"}`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void loadMailboxes()}
                disabled={loadingMailboxes}
              >
                <RefreshCwIcon
                  className={cn("size-4", loadingMailboxes && "animate-spin")}
                />
                Refresh
              </Button>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border">
              {mailboxes.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {loadingMailboxes
                    ? "Checking which mailboxes you can access. This may take a moment…"
                    : "No accessible mailboxes found. Ask your Exchange admin to grant you Full Access to the shared mailbox."}
                </div>
              ) : (
                <ul className="divide-y">
                  {mailboxes.map((mailbox) => {
                    const isSelected = selectedMailbox?.id === mailbox.id;
                    const address = mailboxAddress(mailbox);
                    return (
                      <li key={mailbox.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedMailbox(mailbox)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                            isSelected && "bg-primary/5",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/30",
                            )}
                          >
                            {isSelected ? <CheckIcon className="size-3" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">
                              {mailbox.displayName}
                            </span>
                            <span className="block truncate text-sm text-muted-foreground">
                              {address}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <Button
              onClick={() => void handleSaveMailbox()}
              disabled={savingMailbox || !selectedMailbox}
            >
              {savingMailbox ? "Saving…" : "Use this mailbox"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
