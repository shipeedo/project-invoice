"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  ClockIcon,
  FileTextIcon,
  GalleryVerticalEndIcon,
  ListChecksIcon,
  MailIcon,
  PencilIcon,
  ReceiptIcon,
  RouteIcon,
  Settings2Icon,
  Trash2Icon,
  TruckIcon,
  UserIcon,
} from "lucide-react";
import type { UserRole } from "@/lib/db/types";
import type { InvoiceFilterCounts, NavCounts } from "@/lib/nav-counts";
import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  user: {
    name?: string | null;
    email?: string | null;
    role: UserRole;
  };
  activePath?: string;
  navCounts?: NavCounts;
  mailboxConnection?: {
    email: string;
    lastSyncedLabel: string | null;
  } | null;
  aiBalanceWarning?: {
    balance: number;
  } | null;
};

// Sidebar shortcuts that deep-link into the invoices table with a preset
// filter. The query params match what InvoiceQueue reads from the URL.
const INVOICE_FILTERS: Array<{
  title: string;
  icon: React.ReactNode;
  params: Record<string, string>;
  countKey: keyof InvoiceFilterCounts;
}> = [
  { title: "Assigned to me", icon: <UserIcon />, params: { assignee: "me" }, countKey: "assignedToMe" },
  { title: "Overdue", icon: <AlertTriangleIcon />, params: { urgency: "overdue" }, countKey: "overdue" },
  { title: "Due tomorrow", icon: <CalendarClockIcon />, params: { urgency: "due_tomorrow" }, countKey: "dueTomorrow" },
  { title: "Draft", icon: <PencilIcon />, params: { status: "DRAFT" }, countKey: "draft" },
  { title: "Pending", icon: <ClockIcon />, params: { status: "PENDING_APPROVAL" }, countKey: "pending" },
  { title: "Approved", icon: <CircleCheckIcon />, params: { status: "APPROVED" }, countKey: "approved" },
  { title: "All invoices", icon: <FileTextIcon />, params: {}, countKey: "all" },
];

const INVOICE_FILTER_KEYS = ["q", "supplier", "assignee", "status", "urgency"];

export function AppSidebar({
  user,
  activePath,
  navCounts,
  mailboxConnection,
  aiBalanceWarning,
  ...props
}: AppSidebarProps) {
  const isAdmin = user.role === "ADMIN";
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onQueue = pathname === "/queue";
  const invoiceItems = [
    ...INVOICE_FILTERS.map((filter) => {
      const entries = Object.entries(filter.params);
      const qs = new URLSearchParams(filter.params).toString();
      const isActive =
        onQueue &&
        (entries.length === 0
          ? INVOICE_FILTER_KEYS.every((key) => !searchParams.get(key))
          : entries.every(([key, value]) => searchParams.get(key) === value));
      return {
        title: filter.title,
        url: qs ? `/queue?${qs}` : "/queue",
        icon: filter.icon,
        isActive,
        badge: navCounts?.invoiceFilters?.[filter.countKey],
      };
    }),
    {
      title: "Trash",
      url: "/trash",
      icon: <Trash2Icon />,
      isActive: activePath === "/trash",
      badge: navCounts?.trash,
    },
  ];

  const navItems = [
    {
      title: "Credits",
      url: "/credits",
      icon: <ReceiptIcon />,
      isActive: activePath === "/credits",
      badge: navCounts?.credits,
    },
    {
      title: "Routing rules",
      url: "/routing-rules",
      icon: <RouteIcon />,
      isActive: activePath === "/routing-rules",
    },
    {
      title: "Suppliers",
      url: "/suppliers",
      icon: <TruckIcon />,
      isActive: activePath === "/suppliers",
    },
    ...(isAdmin
      ? [
          {
            title: "Processing",
            url: "/processing",
            icon: <ListChecksIcon />,
            isActive: activePath === "/processing",
            badge: navCounts?.processing,
          },
        ]
      : []),
  ];

  // The connected mailbox card, pinned above Invoices for admins.
  const mailboxProjects =
    isAdmin && mailboxConnection
      ? [
          {
            name: mailboxConnection.email,
            subtitle: mailboxConnection.lastSyncedLabel
              ? `Synced ${mailboxConnection.lastSyncedLabel}`
              : "Not synced yet",
            url: "/admin/o365",
            icon: <MailIcon />,
            isActive: activePath === "/admin/o365",
          },
        ]
      : [];

  const adminProjects = isAdmin
    ? [
        {
          name: "Settings",
          url: "/admin/settings",
          icon: <Settings2Icon />,
          isActive: activePath === "/admin/settings",
        },
      ]
    : [];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher
          teams={[
            {
              name: "Project Invoice",
              logo: <GalleryVerticalEndIcon />,
              plan: "Invoice approval portal",
            },
          ]}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavProjects projects={mailboxProjects} label="" />
        <NavMain items={invoiceItems} label="Invoices" />
        <NavMain items={navItems} label="Workspace" />
        <NavProjects projects={adminProjects} label="Admin" />
        {aiBalanceWarning ? (
          <AiLowBalanceWarning
            balance={aiBalanceWarning.balance}
            isAdmin={isAdmin}
          />
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: user.name ?? user.email ?? "User",
            email: user.email ?? "",
            role: user.role,
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

// Low AI-credit warning shown to every user. Admins can act on it (links to the
// AI settings page); other users just see the informational notice.
function AiLowBalanceWarning({
  balance,
  isAdmin,
}: {
  balance: number;
  isAdmin: boolean;
}) {
  const label = `AI credits low: $${balance.toFixed(2)}`;
  const className =
    "text-amber-600 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-500";

  return (
    <SidebarGroup className="mt-auto">
      <SidebarMenu>
        <SidebarMenuItem>
          {isAdmin ? (
            <SidebarMenuButton
              tooltip={label}
              className={className}
              render={<Link href="/admin/settings#ai-provider" />}
            >
              <AlertTriangleIcon />
              <span>{label}</span>
            </SidebarMenuButton>
          ) : (
            <SidebarMenuButton
              tooltip={label}
              className={cn(className, "cursor-default")}
            >
              <AlertTriangleIcon />
              <span>{label}</span>
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
