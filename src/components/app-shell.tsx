import Link from "next/link";
import { signOut } from "@/lib/auth";
import type { UserRole } from "@prisma/client";

type AppShellProps = {
  children: React.ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
    role: UserRole;
  };
};

const navItems = [
  { href: "/queue", label: "Queue" },
  { href: "/upload", label: "Upload" },
];

const adminItems = [
  { href: "/admin/routing-rules", label: "Routing rules" },
  { href: "/admin/suppliers", label: "Suppliers" },
];

export function AppShell({ children, user }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Project Invoice
            </p>
            <h1 className="text-lg font-semibold">Invoice approval portal</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <p className="font-medium">{user.name ?? user.email}</p>
              <p className="text-slate-500">{user.role.toLowerCase()}</p>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="border-t border-slate-100 bg-white">
          <div className="mx-auto flex max-w-6xl gap-1 px-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
            {user.role === "ADMIN" &&
              adminItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
