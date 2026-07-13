"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { BugIcon, ChevronsUpDownIcon, LogOutIcon } from "lucide-react";
import { useState } from "react";
import { resetPushState } from "@/lib/push-client";
import {
  NotificationFeedList,
  useNotificationFeed,
} from "@/components/notification-feed";
import { NotificationSetup } from "@/components/notification-setup";

function initials(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    role?: string;
    avatar?: string;
  };
}) {
  const { isMobile } = useSidebar();
  const { items, unreadCount, load, markAllRead, clearAll } =
    useNotificationFeed();
  const [open, setOpen] = useState(false);
  const [resetState, setResetState] = useState<"idle" | "resetting" | "done">(
    "idle",
  );

  async function resetPush() {
    setResetState("resetting");
    try {
      await resetPushState();
      setResetState("done");
    } catch (error) {
      console.error("Push reset failed", error);
      setResetState("idle");
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    load();
    if (unreadCount > 0) {
      markAllRead();
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
            }
          >
            <div className="relative">
              <Avatar>
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
              </Avatar>
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.role ? user.role.toLowerCase() : user.email}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-80"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <form action="/api/auth/logout" method="POST">
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      aria-label="Log out"
                      title="Log out"
                    >
                      <LogOutIcon />
                    </Button>
                  </form>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <NotificationSetup />
            <div className="flex items-center justify-between px-3 py-1">
              <p className="text-xs font-medium text-muted-foreground">
                Notifications
              </p>
              {items.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={clearAll}
                >
                  Clear all
                </Button>
              ) : null}
            </div>
            <NotificationFeedList
              items={items}
              onNavigate={() => setOpen(false)}
            />
            {/* DEBUG ONLY — remove before go-live. */}
            <DropdownMenuSeparator />
            <div className="px-3 py-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start px-2 text-xs text-muted-foreground"
                disabled={resetState === "resetting"}
                onClick={() => void resetPush()}
              >
                <BugIcon />
                {resetState === "resetting"
                  ? "Resetting..."
                  : "Reset notifications (debug)"}
              </Button>
              {resetState === "done" ? (
                <p className="px-2 pt-1 text-xs text-muted-foreground">
                  Push state cleared. Now reset this site&apos;s notification
                  permission (icon left of the URL) and reload.
                </p>
              ) : null}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
