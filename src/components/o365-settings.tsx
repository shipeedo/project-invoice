"use client";

import { MailIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function O365Settings({
  initialStatus,
  initialMailboxes,
  connected,
  errorMessage,
}: O365SettingsProps) {
  const [status, setStatus] = useState(initialStatus);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>(initialMailboxes);
  const [search, setSearch] = useState("");
  const [selectedMailboxId, setSelectedMailboxId] = useState(
    initialStatus.mailboxId ?? "",
  );
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
    setSelectedMailboxId(data.mailboxId ?? "");
  }, []);

  const loadMailboxes = useCallback(async (query?: string) => {
    setLoadingMailboxes(true);
    setError(null);
    try {
      const params = query ? `?search=${encodeURIComponent(query)}` : "";
      const response = await fetch(`/api/admin/o365/mailboxes${params}`);
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

  async function handleSaveMailbox() {
    const mailbox = mailboxes.find((entry) => entry.id === selectedMailboxId);
    if (!mailbox) {
      setError("Select a mailbox to monitor");
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
          mailboxId: mailbox.id,
          mailboxUpn: mailbox.mail || mailbox.userPrincipalName,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save mailbox");
      }
      setMessage(`Monitoring mailbox ${mailbox.mail || mailbox.userPrincipalName}.`);
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
        invoicesProcessed?: number;
        processed?: number;
        skipped?: number;
        errors?: string[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Polling failed");
      }
      setMessage(
        `Poll complete — synced ${data.synced ?? data.processed ?? 0} emails, processed ${data.invoicesProcessed ?? 0} invoices, skipped ${data.skipped ?? 0}.`,
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
      setSelectedMailboxId("");
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
            Connection status
          </CardTitle>
          <CardDescription>
            Connect your Microsoft 365 organization and choose the shared mailbox
            that receives supplier invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status.configured ? (
            <Alert variant="destructive">
              <AlertDescription>
                Microsoft OAuth is not configured on this environment. Set
                MS_CLIENT_ID and MS_CLIENT_SECRET to enable the connect flow.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={statusVariant(status.status)}>{status.status}</Badge>
            {status.mailboxUpn ? (
              <span className="text-sm text-muted-foreground">
                Monitoring {status.mailboxUpn}
              </span>
            ) : null}
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
            <div>
              <dt className="text-muted-foreground">Microsoft tenant</dt>
              <dd>{status.microsoftTenantId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last error</dt>
              <dd>{status.lastError ?? "—"}</dd>
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
                  {polling ? "Polling…" : "Poll mailbox now"}
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
            <CardTitle>Shared mailbox</CardTitle>
            <CardDescription>
              Select the mailbox the portal should monitor for new invoice emails.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="mailbox-search">Search mailboxes</Label>
              <div className="flex gap-2">
                <Input
                  id="mailbox-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter by name or address"
                />
                <Button
                  variant="outline"
                  onClick={() => void loadMailboxes(search)}
                  disabled={loadingMailboxes}
                >
                  {loadingMailboxes ? "Loading…" : "Search"}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Mailbox</Label>
              <Select
                value={selectedMailboxId}
                onValueChange={(value) => setSelectedMailboxId(value ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a mailbox" />
                </SelectTrigger>
                <SelectContent>
                  {mailboxes.map((mailbox) => (
                    <SelectItem key={mailbox.id} value={mailbox.id}>
                      {mailbox.displayName} ({mailbox.mail || mailbox.userPrincipalName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => void handleSaveMailbox()} disabled={savingMailbox}>
              {savingMailbox ? "Saving…" : "Save mailbox"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
