const styles: Record<string, string> = {
  RECEIVED: "bg-slate-100 text-slate-700",
  PROCESSING: "bg-blue-100 text-blue-800",
  PENDING_APPROVAL: "bg-amber-100 text-amber-900",
  APPROVED: "bg-emerald-100 text-emerald-900",
  READY_FOR_PAYMENT: "bg-green-100 text-green-900",
  REJECTED: "bg-rose-100 text-rose-900",
  NEEDS_REVIEW: "bg-orange-100 text-orange-900",
};

export function StatusBadge({ status }: { status: string }) {
  const label = status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {label}
    </span>
  );
}
