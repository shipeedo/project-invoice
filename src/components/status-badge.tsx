import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/session";

const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  RECEIVED: "secondary",
  PROCESSING: "outline",
  PENDING_VALIDATION: "outline",
  PENDING_APPROVAL: "outline",
  APPROVED: "default",
  READY_FOR_PAYMENT: "default",
  REJECTED: "destructive",
  NEEDS_REVIEW: "destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={variants[status] ?? "secondary"}>{statusLabel(status)}</Badge>;
}
