import { AlertTriangleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { InvoiceCreditAlert } from "@/lib/invoice-credit-alert";

/**
 * Amber warning shown beside an approved invoice's status badge so a credit is
 * never missed at payment time.
 */
export function CreditAlertBadge({ alert }: { alert: InvoiceCreditAlert }) {
  return (
    <Badge
      variant="outline"
      title={alert.detail}
      className="border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"
    >
      <AlertTriangleIcon data-icon="inline-start" />
      {alert.label}
    </Badge>
  );
}
