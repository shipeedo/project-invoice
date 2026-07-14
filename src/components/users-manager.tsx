"use client";

import { BellIcon, BellOffIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserRole } from "@/lib/db/types";
import { userRoles } from "@/lib/db/types";
import { formatDate, formatRelativeTime, isWithinLast } from "@/lib/format";

type ProductUser = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  createdAt: string | Date;
  pushEnabled?: boolean;
  lastNotificationCheckAt?: string | Date | null;
};

type DirectoryUser = {
  userGuid?: string;
  name: string | null;
  surname: string | null;
  userName: string | null;
  emailAddress: string | null;
  isActive: boolean;
  roles: string[];
};

type UsersManagerProps = {
  initialUsers: ProductUser[];
  currentUserId: string;
};

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  APPROVER: "Approver",
  USER: "User",
};

function directoryDisplayName(user: DirectoryUser) {
  const fullName = [user.name, user.surname].filter(Boolean).join(" ");
  return fullName || user.userName || user.emailAddress || "Unknown user";
}

function sortByName(list: ProductUser[]) {
  return [...list].sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );
}

const ACTIVE_WINDOW_MS = 2 * 60_000;
const ACTIVITY_REFRESH_MS = 60_000;

function ActivityIndicator({ lastSeen }: { lastSeen: string | Date | null }) {
  if (!lastSeen) {
    return <span className="text-sm text-muted-foreground">Never</span>;
  }
  const lastSeenDate = new Date(lastSeen);
  const isActive = isWithinLast(lastSeenDate, ACTIVE_WINDOW_MS);
  return (
    <span className="flex items-center gap-2 text-sm">
      <span
        className={`size-2 shrink-0 rounded-full ${isActive ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
      />
      {isActive ? "Active now" : `Last active ${formatRelativeTime(lastSeenDate)}`}
    </span>
  );
}

export function UsersManager({ initialUsers, currentUserId }: UsersManagerProps) {
  const router = useRouter();
  const [users, setUsers] = useState<ProductUser[]>(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  // Keep the activity/notification columns fresh: re-render the server page
  // periodically and re-sync local state when it delivers new data. Safe to
  // clobber because every mutation round-trips through the server first.
  const [prevInitialUsers, setPrevInitialUsers] = useState(initialUsers);
  if (prevInitialUsers !== initialUsers) {
    setPrevInitialUsers(initialUsers);
    setUsers(sortByName(initialUsers));
  }

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), ACTIVITY_REFRESH_MS);
    return () => clearInterval(interval);
  }, [router]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [addRole, setAddRole] = useState<UserRole>("APPROVER");
  const [addingEmail, setAddingEmail] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [directoryStatus, setDirectoryStatus] = useState<
    "idle" | "loading" | "ready" | "unavailable"
  >("idle");
  const [directoryMessage, setDirectoryMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [manualEmail, setManualEmail] = useState("");
  const [manualName, setManualName] = useState("");

  const accessEmails = new Set(users.map((user) => user.email.toLowerCase()));

  const activeDirectory = directory.filter((entry) => entry.isActive);
  const hiddenInactiveCount = directory.length - activeDirectory.length;

  async function loadDirectory(searchFilter: string) {
    setDirectoryStatus("loading");
    setDirectoryMessage(null);
    const query = searchFilter.trim()
      ? `?filter=${encodeURIComponent(searchFilter.trim())}`
      : "";
    const response = await fetch(`/api/admin/users/directory${query}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setDirectoryStatus("unavailable");
      setDirectoryMessage(body?.error ?? "Could not load the tenant user directory.");
      return;
    }
    const body = (await response.json()) as { items: DirectoryUser[] };
    setDirectory(body.items);
    setDirectoryStatus("ready");
  }

  function openSheet() {
    setSheetOpen(true);
    setSheetError(null);
    if (directoryStatus === "idle") {
      void loadDirectory("");
    }
  }

  async function grantAccess(email: string, name: string | null) {
    setAddingEmail(email);
    setSheetError(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name ?? undefined, role: addRole }),
      });
      const body = (await response.json().catch(() => null)) as
        | (ProductUser & { error?: string })
        | null;
      if (!response.ok) {
        setSheetError(body?.error ?? "Could not add the user.");
        return false;
      }
      if (body) {
        setUsers((current) =>
          sortByName([...current.filter((user) => user.id !== body.id), body]),
        );
      }
      return true;
    } finally {
      setAddingEmail(null);
    }
  }

  async function addManually() {
    const email = manualEmail.trim();
    if (!email) return;
    const added = await grantAccess(email, manualName.trim() || null);
    if (added) {
      setManualEmail("");
      setManualName("");
    }
  }

  async function sendTestNotification(user: ProductUser) {
    setTestingId(user.id);
    setTestResults((current) => ({ ...current, [user.id]: "" }));
    try {
      const response = await fetch(
        `/api/admin/users/${user.id}/test-notification`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        delivery?: {
          subscriptions: number;
          delivered: number;
          pruned: number;
          failed: number;
        };
      } | null;

      if (!response.ok || !body?.delivery) {
        setTestResults((current) => ({
          ...current,
          [user.id]: body?.error ?? "Could not send the test notification.",
        }));
        return;
      }

      const { subscriptions, delivered } = body.delivery;
      const message =
        subscriptions === 0
          ? "In-app only — no push devices enrolled"
          : delivered > 0
            ? `Push sent to ${delivered} of ${subscriptions} device${subscriptions === 1 ? "" : "s"}`
            : `Push failed on all ${subscriptions} device${subscriptions === 1 ? "" : "s"}`;
      setTestResults((current) => ({ ...current, [user.id]: message }));
    } finally {
      setTestingId(null);
    }
  }

  async function removeUser(user: ProductUser) {
    if (
      !window.confirm(
        `Remove access for ${user.name ?? user.email}? Their account stays on the auth server — they just won't be able to use Project Invoice.`,
      )
    ) {
      return;
    }
    setRemovingId(user.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not remove the user.");
        return;
      }
      setUsers((current) => current.filter((entry) => entry.id !== user.id));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            Users
            <Badge variant="secondary">{users.length}</Badge>
          </CardTitle>
          <CardDescription>
            Control who can use Project Invoice. Users sign in with their Shipeedo
            account, but only the people listed here get access.
          </CardDescription>
          <CardAction>
            <Button type="button" size="sm" variant="outline" onClick={openSheet}>
              <PlusIcon />
              Add user
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Notifications</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No users have access yet.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name ?? user.email}
                      {user.id === currentUserId ? (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span
                                aria-label={
                                  user.pushEnabled
                                    ? "Browser notifications enabled"
                                    : "Browser notifications not enabled"
                                }
                              />
                            }
                          >
                            {user.pushEnabled ? (
                              <BellIcon className="size-4 text-foreground" />
                            ) : (
                              <BellOffIcon className="size-4 text-muted-foreground/50" />
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            {user.pushEnabled
                              ? "Browser notifications enabled"
                              : "Browser notifications not enabled"}
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={testingId !== null}
                          onClick={() => void sendTestNotification(user)}
                        >
                          {testingId === user.id ? "Sending..." : "Send test"}
                        </Button>
                      </div>
                      {testResults[user.id] ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {testResults[user.id]}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <ActivityIndicator
                        lastSeen={user.lastNotificationCheckAt ?? null}
                      />
                    </TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={user.id === currentUserId || removingId === user.id}
                        onClick={() => removeUser(user)}
                      >
                        {removingId === user.id ? "Removing..." : "Remove"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Add user</SheetTitle>
            <SheetDescription>
              Grant a user from your Shipeedo tenant access to Project Invoice.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pb-6">
            {sheetError ? (
              <Alert variant="destructive">
                <AlertDescription>{sheetError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="add-role">Add as</Label>
              <Select
                value={addRole}
                onValueChange={(next) => next && setAddRole(next as UserRole)}
              >
                <SelectTrigger id="add-role" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {userRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {directoryStatus === "unavailable" ? (
              <Alert>
                <AlertDescription>{directoryMessage}</AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-col gap-3">
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void loadDirectory(filter);
                  }}
                >
                  <Input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Search tenant users"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={directoryStatus === "loading"}
                  >
                    <SearchIcon />
                    Search
                  </Button>
                </form>

                {directoryStatus === "loading" ? (
                  <p className="text-sm text-muted-foreground">Loading directory...</p>
                ) : (
                  <div className="flex flex-col divide-y rounded-lg border">
                    {activeDirectory.length === 0 && directoryStatus === "ready" ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground">
                        No tenant users match this search.
                      </p>
                    ) : (
                      activeDirectory.map((entry) => {
                        const email = entry.emailAddress ?? entry.userName;
                        const alreadyAdded =
                          !!email && accessEmails.has(email.toLowerCase());
                        return (
                          <div
                            key={entry.userGuid ?? email ?? directoryDisplayName(entry)}
                            className="flex items-center justify-between gap-3 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {directoryDisplayName(entry)}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {email ?? "No email"}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!email || alreadyAdded || addingEmail === email}
                              onClick={() =>
                                email && grantAccess(email, directoryDisplayName(entry))
                              }
                            >
                              {alreadyAdded
                                ? "Added"
                                : addingEmail === email
                                  ? "Adding..."
                                  : "Add"}
                            </Button>
                          </div>
                        );
                      })
                    )}
                    {hiddenInactiveCount > 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        {hiddenInactiveCount} inactive{" "}
                        {hiddenInactiveCount === 1 ? "user" : "users"} hidden
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            <Separator />

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Add by email</p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="manual-email">Email</Label>
                <Input
                  id="manual-email"
                  type="email"
                  value={manualEmail}
                  onChange={(event) => setManualEmail(event.target.value)}
                  placeholder="user@company.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="manual-name">Name (optional)</Label>
                <Input
                  id="manual-name"
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                />
              </div>
              <div>
                <Button
                  type="button"
                  onClick={addManually}
                  disabled={!manualEmail.trim() || addingEmail !== null}
                >
                  {addingEmail === manualEmail.trim() ? "Adding..." : "Add user"}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
