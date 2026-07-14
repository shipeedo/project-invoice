"use client";

import Link from "next/link";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavProjects({
  projects,
  label = "Admin",
}: {
  label?: string;
  projects: {
    name: string;
    url: string;
    icon: React.ReactNode;
    isActive?: boolean;
    subtitle?: string;
  }[];
}) {
  if (projects.length === 0) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarMenu>
        {projects.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton
              isActive={item.isActive}
              render={<Link href={item.url} />}
              className={item.subtitle ? "h-auto py-1.5" : undefined}
            >
              {item.icon}
              {item.subtitle ? (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{item.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.subtitle}
                  </span>
                </span>
              ) : (
                <span className="truncate">{item.name}</span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
