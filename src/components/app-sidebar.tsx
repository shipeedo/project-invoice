"use client";

import {
  FileTextIcon,
  GalleryVerticalEndIcon,
  InboxIcon,
  MailIcon,
  ReceiptIcon,
  RouteIcon,
  Trash2Icon,
  TruckIcon,
  UploadIcon,
  UsersIcon,
} from "lucide-react";
import type { UserRole } from "@/lib/db/types";
import type { NavCounts } from "@/lib/nav-counts";
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
};

export function AppSidebar({ user, activePath, navCounts, ...props }: AppSidebarProps) {
  const isAdmin = user.role === "ADMIN";

  const navItems = [
    {
      title: "Invoices",
      url: "/queue",
      icon: <FileTextIcon />,
      isActive:
        activePath === "/queue" ||
        activePath?.startsWith("/invoices/"),
      badge: navCounts?.invoices,
    },
    {
      title: "Upload",
      url: "/upload",
      icon: <UploadIcon />,
      isActive: activePath === "/upload",
    },
    {
      title: "Inbox",
      url: "/inbox",
      icon: <InboxIcon />,
      isActive: activePath === "/inbox" || activePath?.startsWith("/inbox/"),
      badge: navCounts?.inbox,
    },
    {
      title: "Trash",
      url: "/trash",
      icon: <Trash2Icon />,
      isActive: activePath === "/trash",
      badge: navCounts?.trash,
    },
    {
      title: "Credits",
      url: "/credits",
      icon: <ReceiptIcon />,
      isActive: activePath === "/credits",
      badge: navCounts?.credits,
    },
  ];

  const adminProjects = isAdmin
    ? [
        {
          name: "Routing rules",
          url: "/admin/routing-rules",
          icon: <RouteIcon />,
          isActive: activePath === "/admin/routing-rules",
        },
        {
          name: "Suppliers",
          url: "/admin/suppliers",
          icon: <TruckIcon />,
          isActive: activePath === "/admin/suppliers",
        },
        {
          name: "Office 365",
          url: "/admin/o365",
          icon: <MailIcon />,
          isActive: activePath === "/admin/o365",
        },
        {
          name: "Users",
          url: "/admin/users",
          icon: <UsersIcon />,
          isActive: activePath === "/admin/users",
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
