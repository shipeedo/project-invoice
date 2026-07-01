export type DueDateUrgency = "overdue" | "due-soon" | "ok";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function daysBetween(start: Date, end: Date): number {
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endDay - startDay) / MS_PER_DAY);
}

export function getDueDateUrgency(
  dueDate: Date | null | undefined,
  now = new Date(),
): DueDateUrgency | null {
  if (!dueDate) return null;

  const daysUntilDue = daysBetween(now, dueDate);
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue <= 3) return "due-soon";
  return "ok";
}

export function getResponseDueUrgency(
  responseDueAt: Date | null | undefined,
  now = new Date(),
): DueDateUrgency | null {
  if (!responseDueAt) return null;

  if (responseDueAt.getTime() < now.getTime()) return "overdue";
  const daysUntilDue = daysBetween(now, responseDueAt);
  if (daysUntilDue <= 1) return "due-soon";
  return "ok";
}

export function urgencyLabel(urgency: DueDateUrgency): string {
  switch (urgency) {
    case "overdue":
      return "Overdue";
    case "due-soon":
      return "Due soon";
    case "ok":
      return "On track";
  }
}
