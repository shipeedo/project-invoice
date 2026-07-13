"use client";

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
  PlugIcon,
  ReceiptIcon,
  RouteIcon,
  Trash2Icon,
  TruckIcon,
  UserIcon,
  UsersIcon,
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
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

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
    ...(isAdmin
      ? [
          {
            title: "Processing",
            url: "/processing",
            icon: <ListChecksIcon />,
            isActive: activePath === "/processing",
            badge: navCounts?.processing,
          },
          {
            title: "Routing rules",
            url: "/admin/routing-rules",
            icon: <RouteIcon />,
            isActive: activePath === "/admin/routing-rules",
          },
          {
            title: "Suppliers",
            url: "/admin/suppliers",
            icon: <TruckIcon />,
            isActive: activePath === "/admin/suppliers",
          },
          {
            title: "Users",
            url: "/admin/users",
            icon: <UsersIcon />,
            isActive: activePath === "/admin/users",
          },
        ]
      : []),
  ];

  const adminProjects = isAdmin
    ? [
        mailboxConnection
          ? {
              name: mailboxConnection.email,
              subtitle: mailboxConnection.lastSyncedLabel
                ? `Synced ${mailboxConnection.lastSyncedLabel}`
                : "Not synced yet",
              url: "/admin/o365",
              icon: <MailIcon />,
              isActive: activePath === "/admin/o365",
            }
          : {
              name: "Connections",
              url: "/admin/connections",
              icon: <PlugIcon />,
              isActive:
                activePath === "/admin/connections" ||
                activePath === "/admin/o365",
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
        <NavMain items={invoiceItems} label="Invoices" />
        <NavMain items={navItems} label="Workspace" />
        <NavProjects projects={adminProjects} label="Admin" />
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
