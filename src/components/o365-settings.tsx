"use client";

import {
  CheckIcon,
  MailIcon,
  RefreshCwIcon,
  SearchIcon,
  UnplugIcon,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type PickerMode = "browse" | "manual";

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

function matchesQuery(mailbox: Mailbox, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    mailbox.displayName.toLowerCase().includes(normalized) ||
    mailbox.mail.toLowerCase().includes(normalized) ||
    mailbox.userPrincipalName.toLowerCase().includes(normalized)
  );
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
  const [pickerMode, setPickerMode] = useState<PickerMode>("browse");
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
  const [manualAddress, setManualAddress] = useState("");
  const [manualMailbox, setManualMailbox] = useState<Mailbox | null>(null);
  const [loadingMailboxes, setLoadingMailboxes] = useState(false);
  const [resolvingManual, setResolvingManual] = useState(false);
  const [savingMailbox, setSavingMailbox] = useState(false);
  const [polling, setPolling] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(
    connected ? "Office 365 connected successfully." : errorMessage ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedMailboxes, setHasLoadedMailboxes] = useState(
    initialMailboxes.length > 0,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const loadMailboxes = useCallback(async (query?: string) => {
    setLoadingMailboxes(true);
    setError(null);
    try {
      const params = query?.trim()
        ? `?search=${encodeURIComponent(query.trim())}`
        : "";
      const response = await fetch(`/api/admin/o365/mailboxes${params}`);
      const data = (await response.json()) as {
        mailboxes?: Mailbox[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load mailboxes");
      }
      setMailboxes(data.mailboxes ?? []);
      setHasLoadedMailboxes(true);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load mailboxes",
      );
    } finally {
      setLoadingMailboxes(false);
    }
  }, []);

  const filteredMailboxes = useMemo(
    () => mailboxes.filter((mailbox) => matchesQuery(mailbox, search)),
    [mailboxes, search],
  );

  function openBrowseMode() {
    setPickerMode("browse");
    if (!hasLoadedMailboxes && !loadingMailboxes) {
      void loadMailboxes();
    }
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void loadMailboxes(value);
    }, 350);
  }

  async function handleResolveManualAddress() {
    const address = manualAddress.trim();
    if (!address) {
      setError("Enter a mailbox email address");
      return;
    }

    setResolvingManual(true);
    setError(null);
    setManualMailbox(null);
    try {
      const response = await fetch(
        `/api/admin/o365/mailboxes/resolve?address=${encodeURIComponent(address)}`,
      );
      const data = (await response.json()) as { mailbox?: Mailbox; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Mailbox not found");
      }
      setManualMailbox(data.mailbox ?? null);
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : "Could not find that mailbox",
      );
    } finally {
      setResolvingManual(false);
    }
  }

  async function saveMailboxSelection(mailbox: Mailbox) {
    setSavingMailbox(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/o365/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxId: mailbox.id,
          mailboxUpn: mailboxAddress(mailbox),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save mailbox");
      }
      setSelectedMailbox(mailbox);
      setMessage(`Now monitoring ${mailboxAddress(mailbox)}.`);
      await refreshStatus();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save mailbox",
      );
    } finally {
      setSavingMailbox(false);
    }
  }

  async function handleSaveMailbox() {
    const mailbox =
      pickerMode === "manual" ? manualMailbox : selectedMailbox;
    if (!mailbox) {
      setError(
        pickerMode === "manual"
          ? "Verify a mailbox address first"
          : "Select a mailbox from the list",
      );
      return;
    }
    await saveMailboxSelection(mailbox);
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
        `Poll complete — synced ${data.synced ?? data.processed ?? 0} emails, processed ${data.invoicesProcessed ?? 0} invoices.`,
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
      setManualMailbox(null);
      setHasLoadedMailboxes(false);
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

  const activeSelection =
    pickerMode === "manual" ? manualMailbox : selectedMailbox;

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
              Pick the shared mailbox where carriers send invoices — for example{" "}
              <span className="font-medium">invoices@yourcompany.com</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {status.mailboxUpn ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                <p className="font-medium">Currently monitoring</p>
                <p className="mt-1 text-muted-foreground">{status.mailboxUpn}</p>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant={pickerMode === "browse" ? "default" : "outline"}
                size="sm"
                onClick={openBrowseMode}
              >
                Browse mailboxes
              </Button>
              <Button
                type="button"
                variant={pickerMode === "manual" ? "default" : "outline"}
                size="sm"
                onClick={() => setPickerMode("manual")}
              >
                Enter address
              </Button>
            </div>

            {pickerMode === "browse" ? (
              <div className="space-y-3">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="mailbox-search"
                    value={search}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    onFocus={() => {
                      if (!hasLoadedMailboxes && !loadingMailboxes) {
                        void loadMailboxes();
                      }
                    }}
                    placeholder="Search by name or email address…"
                    className="pl-9"
                  />
                </div>

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {loadingMailboxes
                      ? "Loading mailboxes…"
                      : `${filteredMailboxes.length} mailbox${filteredMailboxes.length === 1 ? "" : "es"} found`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void loadMailboxes(search)}
                    disabled={loadingMailboxes}
                  >
                    <RefreshCwIcon
                      className={cn("size-4", loadingMailboxes && "animate-spin")}
                    />
                    Refresh
                  </Button>
                </div>

                <div className="max-h-80 overflow-y-auto rounded-lg border">
                  {filteredMailboxes.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {loadingMailboxes ? (
                        "Loading mailboxes…"
                      ) : !hasLoadedMailboxes ? (
                        <span>
                          Click{" "}
                          <button
                            type="button"
                            className="text-primary underline-offset-4 hover:underline"
                            onClick={() => void loadMailboxes()}
                          >
                            load mailboxes
                          </button>{" "}
                          or use Enter address for shared mailboxes.
                        </span>
                      ) : (
                        "No mailboxes match your search. Try Enter address for shared mailboxes."
                      )}
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {filteredMailboxes.map((mailbox) => {
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
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Shared mailboxes often do not appear in search. Enter the full email
                  address and we will verify you have access.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="manual-mailbox">Mailbox email address</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="manual-mailbox"
                      type="email"
                      value={manualAddress}
                      onChange={(event) => {
                        setManualAddress(event.target.value);
                        setManualMailbox(null);
                      }}
                      placeholder="invoices@yourcompany.com"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleResolveManualAddress();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleResolveManualAddress()}
                      disabled={resolvingManual || !manualAddress.trim()}
                    >
                      {resolvingManual ? "Checking…" : "Verify access"}
                    </Button>
                  </div>
                </div>

                {manualMailbox ? (
                  <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                    <p className="font-medium">{manualMailbox.displayName}</p>
                    <p className="text-muted-foreground">
                      {mailboxAddress(manualMailbox)}
                    </p>
                    <p className="mt-2 text-primary">Access verified — ready to save</p>
                  </div>
                ) : null}
              </div>
            )}

            {activeSelection ? (
              <div className="rounded-lg border px-4 py-3 text-sm">
                <p className="text-muted-foreground">Selected</p>
                <p className="font-medium">{activeSelection.displayName}</p>
                <p className="text-muted-foreground">
                  {mailboxAddress(activeSelection)}
                </p>
              </div>
            ) : null}

            <Button
              onClick={() => void handleSaveMailbox()}
              disabled={savingMailbox || !activeSelection}
            >
              {savingMailbox ? "Saving…" : "Use this mailbox"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
