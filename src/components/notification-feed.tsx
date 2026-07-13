"use client";

import { BellIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/format";

const POLL_INTERVAL_MS = 30_000;

export type NotificationItem = {
  id: string;
  invoiceId: string | null;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

/** Polls the notification feed and exposes the list + unread count. */
export function useNotificationFeed() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(() => {
    fetch("/api/notifications?limit=15")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          notifications: NotificationItem[];
          unreadCount: number;
        };
        setItems(body.notifications);
        setUnreadCount(body.unreadCount);
      })
      .catch(() => {
        // Network hiccup — the next poll will catch up.
      });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => undefined);
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setUnreadCount(0);
    fetch("/api/notifications", { method: "DELETE" }).catch(() => undefined);
  }, []);

  return { items, unreadCount, load, markAllRead, clearAll };
}

export function NotificationFeedList({
  items,
  onNavigate,
}: {
  items: NotificationItem[];
  onNavigate?: () => void;
}) {
  const router = useRouter();

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <BellIcon className="size-4 shrink-0 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No notifications yet</p>
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            onNavigate?.();
            if (item.invoiceId) {
              router.push(`/invoices/${item.invoiceId}`);
            }
          }}
          className="flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            {item.readAt === null ? (
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
            ) : null}
            <span className="truncate">{item.title}</span>
          </span>
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </span>
          <span className="text-xs text-muted-foreground/70">
            {formatRelativeTime(item.createdAt)}
          </span>
        </button>
      ))}
    </div>
  );
}
