import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/db/types";

export { formatCurrency, formatDate } from "@/lib/format";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session;
}

export async function requireRole(allowed: UserRole[]) {
  const session = await requireSession();
  if (!allowed.includes(session.user.role)) {
    redirect("/");
  }
  return session;
}

export function statusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
