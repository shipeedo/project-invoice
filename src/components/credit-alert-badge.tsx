import { CircleCheckIcon, ClockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { InvoiceCreditAlert } from "@/lib/invoice-credit-alert";

/**
 * Shown beside an approved invoice's status badge so a credit is never missed
 * at payment time. Green means the credit is settled and just needs deducting;
 * amber means the carrier still owes us an answer, so the payable amount isn't
 * known yet. The two were being read as the same thing at a glance.
 */
const TONE_STYLES: Record<InvoiceCreditAlert["tone"], string> = {
  granted:
    "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  waiting: "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export function CreditAlertBadge({ alert }: { alert: InvoiceCreditAlert }) {
  const Icon = alert.tone === "granted" ? CircleCheckIcon : ClockIcon;

  return (
    <Badge variant="outline" title={alert.detail} className={TONE_STYLES[alert.tone]}>
      <Icon data-icon="inline-start" />
      {alert.label}
    </Badge>
  );
}
