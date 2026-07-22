import { Badge } from "@/components/ui/badge";
import {
  CREDIT_STATUS_DESCRIPTIONS,
  CREDIT_STATUS_LABELS,
} from "@/lib/credit-line-utils";
import type { CreditRequestStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * Colour is the fastest read on a table of credits: grey means nothing has
 * happened yet, blue is with the carrier, green/amber/red are the three ways
 * it can land. Deliberately distinct from the invoice status badge, which
 * these were being mistaken for.
 */
const STATUS_STYLES: Record<CreditRequestStatus, string> = {
  PENDING: "bg-muted text-muted-foreground",
  SUBMITTED: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  APPROVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  PARTIALLY_APPROVED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  REJECTED: "bg-destructive/15 text-destructive",
};

export function CreditStatusBadge({
  status,
  className,
}: {
  status: CreditRequestStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      title={CREDIT_STATUS_DESCRIPTIONS[status]}
      className={cn("font-medium", STATUS_STYLES[status], className)}
    >
      {CREDIT_STATUS_LABELS[status]}
    </Badge>
  );
}
