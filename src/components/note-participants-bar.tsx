"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOutIcon, UserPlusIcon, XIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type NoteParticipant = {
  userId: string;
  name: string | null;
  email: string;
};

type OrgUser = {
  id: string;
  name: string | null;
  email: string;
};

type NoteParticipantsBarProps = {
  invoiceId: string;
  currentUserId: string;
  /** Whether this viewer may add or remove people. */
  canManage: boolean;
  /** Load data only once the thread is actually on screen. */
  active: boolean;
  /** Bumped by the parent after a note is posted, since posting can add the
   * author and anyone they mentioned to the thread. */
  refreshToken?: number;
};

const AVATARS_SHOWN = 4;

function label(user: { name: string | null; email: string }) {
  return user.name ?? user.email;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function NoteParticipantsBar({
  invoiceId,
  currentUserId,
  canManage,
  active,
  refreshToken = 0,
}: NoteParticipantsBarProps) {
  const [participants, setParticipants] = useState<NoteParticipant[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    fetch(`/api/invoices/${invoiceId}/notes/participants`)
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { participants: NoteParticipant[] };
        setParticipants(body.participants);
      })
      .catch(() => {
        // The thread still works without the membership list.
      });

    return () => {
      cancelled = true;
    };
  }, [active, invoiceId, refreshToken]);

  useEffect(() => {
    if (!panelOpen || !canManage || users.length > 0) return;
    let cancelled = false;

    fetch("/api/users")
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { users: OrgUser[] };
        setUsers(body.users);
      })
      .catch(() => setError("Couldn't load the people list"));

    return () => {
      cancelled = true;
    };
  }, [panelOpen, canManage, users.length]);

  const apply = useCallback(
    async (userId: string, request: () => Promise<Response>) => {
      setBusyUserId(userId);
      setError(null);
      try {
        const response = await request();
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(body?.error ?? "That didn't work");
          return;
        }
        const body = (await response.json()) as { participants: NoteParticipant[] };
        setParticipants(body.participants);
      } catch {
        setError("That didn't work");
      } finally {
        setBusyUserId(null);
      }
    },
    [],
  );

  const add = (userId: string) =>
    apply(userId, () =>
      fetch(`/api/invoices/${invoiceId}/notes/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [userId] }),
      }),
    );

  const remove = (userId: string) =>
    apply(userId, () =>
      fetch(`/api/invoices/${invoiceId}/notes/participants/${userId}`, {
        method: "DELETE",
      }),
    );

  const inThread = new Set(participants.map((participant) => participant.userId));
  const addable = users.filter((user) => !inThread.has(user.id));
  const shown = participants.slice(0, AVATARS_SHOWN);
  const overflow = participants.length - shown.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {participants.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No one is following this thread yet.
          </p>
        ) : (
          <>
            <div className="flex -space-x-2">
              {shown.map((participant) => (
                <Avatar
                  key={participant.userId}
                  className="size-7 ring-2 ring-background"
                  title={label(participant)}
                >
                  <AvatarFallback className="text-[10px]">
                    {initials(label(participant))}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {participants.length} in this thread
              {overflow > 0 ? ` (+${overflow} more)` : ""}
            </span>
          </>
        )}

        {canManage ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-7 px-2 text-xs"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((current) => !current)}
          >
            <UserPlusIcon className="size-3.5" />
            {panelOpen ? "Done" : "People"}
          </Button>
        ) : null}
      </div>

      {panelOpen && canManage ? (
        <div className="flex max-h-56 flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/30 p-3">
          {participants.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                In this thread
              </p>
              {participants.map((participant) => {
                const isSelf = participant.userId === currentUserId;
                return (
                  <div
                    key={participant.userId}
                    className="flex items-center gap-2 rounded-md px-1 py-1 text-sm"
                  >
                    <Avatar className="size-6">
                      <AvatarFallback className="text-[10px]">
                        {initials(label(participant))}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate">
                      {label(participant)}
                      {isSelf ? " (you)" : ""}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-xs text-muted-foreground"
                      disabled={busyUserId === participant.userId}
                      aria-label={
                        isSelf
                          ? "Leave this thread"
                          : `Remove ${label(participant)} from this thread`
                      }
                      onClick={() => void remove(participant.userId)}
                    >
                      {busyUserId === participant.userId ? (
                        <Spinner className="size-3" />
                      ) : isSelf ? (
                        <>
                          <LogOutIcon className="size-3" />
                          Leave
                        </>
                      ) : (
                        <XIcon className="size-3" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Add someone
            </p>
            {addable.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                Everyone is already here.
              </p>
            ) : (
              addable.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  disabled={busyUserId === user.id}
                  onClick={() => void add(user.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-1 py-1 text-left text-sm",
                    "hover:bg-accent disabled:opacity-60",
                  )}
                >
                  <Avatar className="size-6">
                    <AvatarFallback className="text-[10px]">
                      {initials(label(user))}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">{label(user)}</span>
                  {busyUserId === user.id ? (
                    <Spinner className="size-3" />
                  ) : (
                    <UserPlusIcon className="size-3.5 text-muted-foreground" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
