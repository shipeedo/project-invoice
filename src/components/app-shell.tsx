import Link from "next/link";
import type { UserRole } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
    role: UserRole;
  };
  activePath?: string;
};

const navItems = [
  { href: "/queue", label: "Queue" },
  { href: "/upload", label: "Upload" },
];

const adminItems = [
  { href: "/admin/routing-rules", label: "Routing rules" },
  { href: "/admin/suppliers", label: "Suppliers" },
];

export function AppShell({ children, user, activePath }: AppShellProps) {
  const items = user.role === "ADMIN" ? [...navItems, ...adminItems] : navItems;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Project Invoice
            </p>
            <h1 className="text-lg font-semibold">Invoice approval portal</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <p className="font-medium">{user.name ?? user.email}</p>
              <p className="text-muted-foreground">{user.role.toLowerCase()}</p>
            </div>
            <form action="/api/auth/logout" method="POST">
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
        <Separator />
        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                activePath === item.href
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
