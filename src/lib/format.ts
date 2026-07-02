export function formatCurrency(amount: number | null | undefined, currency = "AUD") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
