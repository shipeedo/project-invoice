"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export type NavMainItem = {
  title: string;
  url: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  badge?: number;
};

export function NavMain({ items, label = "Platform" }: { items: NavMainItem[]; label?: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              isActive={item.isActive}
              tooltip={item.title}
              render={<Link href={item.url} />}
            >
              {item.icon}
              <span>{item.title}</span>
              {item.badge != null && item.badge > 0 ? (
                <Badge
                  variant="secondary"
                  className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px] tabular-nums group-data-[collapsible=icon]:hidden"
                >
                  {item.badge}
                </Badge>
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
