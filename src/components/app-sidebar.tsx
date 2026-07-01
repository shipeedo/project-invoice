"use client";

import {
  AlarmClockIcon,
  FileTextIcon,
  GalleryVerticalEndIcon,
  RouteIcon,
  TruckIcon,
} from "lucide-react";
import type { UserRole } from "@/lib/db/types";
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
};

export function AppSidebar({ user, activePath, ...props }: AppSidebarProps) {
  const isAdmin = user.role === "ADMIN";
  const invoiceActive =
    activePath === "/queue" ||
    activePath === "/upload" ||
    activePath?.startsWith("/invoices/");

  const navMain = [
    {
      title: "Invoices",
      icon: <FileTextIcon />,
      isActive: invoiceActive,
      items: [
        {
          title: "Queue",
          url: "/queue",
          isActive: activePath === "/queue",
        },
        {
          title: "Upload",
          url: "/upload",
          isActive: activePath === "/upload",
        },
      ],
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
          name: "Response due rules",
          url: "/admin/response-due-rules",
          icon: <AlarmClockIcon />,
          isActive: activePath === "/admin/response-due-rules",
        },
        {
          name: "Escalation rules",
          url: "/admin/escalation-rules",
          icon: <AlarmClockIcon />,
          isActive: activePath === "/admin/escalation-rules",
        },
        {
          name: "Suppliers",
          url: "/admin/suppliers",
          icon: <TruckIcon />,
          isActive: activePath === "/admin/suppliers",
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
        <NavMain items={navMain} label="Workspace" />
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
