import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/format";

const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  PENDING_APPROVAL: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
  ON_HOLD: "outline",
  CANCELLED: "secondary",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={variants[status] ?? "secondary"}>{statusLabel(status)}</Badge>;
}
