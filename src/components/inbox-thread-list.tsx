"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { InboxSyncButton } from "@/components/inbox-sync-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type InboxThreadSummary = {
  id: string;
  subject: string | null;
  lastMessageAt: Date | string | null;
  supplier: { id: string; name: string } | null;
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    fromEmail: string | null;
    fromName: string | null;
    bodyText: string | null;
    receivedAt: Date | string | null;
  }>;
};

function formatThreadDate(value: Date | string | null) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return new Intl.DateTimeFormat("en-AU", { timeStyle: "short" }).format(date);
  }

  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(date);
}

function senderLabel(thread: InboxThreadSummary) {
  const latest = thread.messages[0];
  return latest?.fromName ?? latest?.fromEmail ?? "Unknown sender";
}

function senderInitial(thread: InboxThreadSummary) {
  const label = senderLabel(thread);
  return label.charAt(0).toUpperCase();
}

function matchesFilter(thread: InboxThreadSummary, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const latest = thread.messages[0];
  const fields = [
    thread.subject,
    thread.supplier?.name,
    latest?.fromName,
    latest?.fromEmail,
    latest?.bodyText,
  ].filter(Boolean);
  return fields.some((field) => field!.toLowerCase().includes(normalized));
}

type InboxThreadListProps = {
  threads: InboxThreadSummary[];
  activeThreadId?: string | null;
};

export function InboxThreadList({ threads, activeThreadId }: InboxThreadListProps) {
  const [filter, setFilter] = useState("");

  const filteredThreads = useMemo(
    () => threads.filter((thread) => matchesFilter(thread, filter)),
    [threads, filter],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b p-3">
        <div className="flex items-center gap-2">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search mail…"
            className="min-w-0 flex-1 bg-background"
          />
          <InboxSyncButton />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredThreads.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {filter.trim() ? "No conversations match your search." : "No emails yet."}
          </p>
        ) : (
          <ul>
            {filteredThreads.map((thread) => {
              const latest = thread.messages[0];
              const messageCount = thread.messages.length;
              const isActive = thread.id === activeThreadId;
              return (
                <li key={thread.id}>
                  <Link
                    href={`/inbox/${thread.id}`}
                    className={cn(
                      "flex gap-3 border-b px-3 py-3 transition-colors",
                      thread.supplier
                        ? "hover:bg-emerald-50/70"
                        : "hover:bg-muted/50",
                      isActive &&
                        (thread.supplier ? "bg-emerald-50/90" : "bg-muted/70"),
                    )}
                  >
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="text-xs">
                        {senderInitial(thread)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-sm",
                            isActive ? "font-semibold" : "font-medium",
                          )}
                        >
                          {senderLabel(thread)}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {messageCount > 1 ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {messageCount}
                            </Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {formatThreadDate(thread.lastMessageAt)}
                          </span>
                        </div>
                      </div>
                      <p
                        className={cn(
                          "truncate text-sm",
                          isActive ? "font-medium" : "text-foreground/80",
                        )}
                      >
                        {thread.subject ?? "(No subject)"}
                      </p>
                      {latest?.bodyText ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {latest.bodyText}
                        </p>
                      ) : null}
                      {thread.supplier ? (
                        <Badge className="mt-1.5 border-emerald-300 bg-emerald-100 text-[10px] text-emerald-900 hover:bg-emerald-100">
                          {thread.supplier.name}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="mt-1.5 border-muted-foreground/30 bg-muted text-[10px] text-muted-foreground"
                        >
                          No supplier
                        </Badge>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
