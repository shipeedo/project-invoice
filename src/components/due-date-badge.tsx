import { Badge } from "@/components/ui/badge";
import type { DueDateUrgency } from "@/lib/due-dates";
import { urgencyLabel } from "@/lib/due-dates";
import { cn } from "@/lib/utils";

type DueDateBadgeProps = {
  urgency: DueDateUrgency | null;
  className?: string;
};

export function DueDateBadge({ urgency, className }: DueDateBadgeProps) {
  if (!urgency || urgency === "ok") return null;

  return (
    <Badge
      variant={urgency === "overdue" ? "destructive" : "secondary"}
      className={cn(className)}
    >
      {urgencyLabel(urgency)}
    </Badge>
  );
}
