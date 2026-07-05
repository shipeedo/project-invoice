import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/db/types";

export { formatCurrency, formatDate, statusLabel } from "@/lib/format";

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
