import Link from "next/link";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/db/types";
import type { NavCounts } from "@/lib/nav-counts";

export type BreadcrumbEntry = {
  label: string;
  href?: string;
};

type AppShellProps = {
  children: React.ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
    role: UserRole;
  };
  activePath?: string;
  navCounts?: NavCounts;
  breadcrumbs?: BreadcrumbEntry[];
  fillViewport?: boolean;
};

export function AppShell({
  children,
  user,
  activePath,
  navCounts,
  breadcrumbs = [],
  fillViewport = false,
}: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar user={user} activePath={activePath} navCounts={navCounts} />
      <SidebarInset
        className={cn(
          "min-w-0 overflow-x-hidden",
          fillViewport && "h-svh min-h-0 overflow-hidden",
        )}
      >
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            {breadcrumbs.length > 0 ? (
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((crumb, index) => {
                    const isLast = index === breadcrumbs.length - 1;
                    return (
                      <span key={`${crumb.label}-${index}`} className="contents">
                        <BreadcrumbItem className={index === 0 ? "hidden md:block" : undefined}>
                          {isLast || !crumb.href ? (
                            <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink render={<Link href={crumb.href} />}>
                              {crumb.label}
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                        {!isLast ? (
                          <BreadcrumbSeparator className={index === 0 ? "hidden md:block" : undefined} />
                        ) : null}
                      </span>
                    );
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            ) : (
              <span className="text-sm font-medium">Project Invoice</span>
            )}
          </div>
        </header>
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0",
            fillViewport && "min-h-0 overflow-hidden",
          )}
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
