import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Setup health of a settings section, shown beside the card title. Uses the
 * same green/amber language as the SettingsNav dots, and a soft tint (rather
 * than the solid primary badge) so it reads as a state, not an action.
 */
export function SectionStatusBadge({
  status,
  children,
}: {
  status: "ready" | "attention";
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "ready"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      {status === "ready" ? <CheckCircle2Icon /> : <TriangleAlertIcon />}
      {children}
    </Badge>
  );
}
