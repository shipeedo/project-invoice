import type {
  ResponseDueRuleAnchor,
  ResponseDueRuleDirection,
} from "@/lib/db/types";

export const ANCHOR_INFO: Record<
  ResponseDueRuleAnchor,
  { label: string; description: string }
> = {
  INVOICE_DUE_DATE: {
    label: "Invoice due date",
    description: "The payment due date on the invoice.",
  },
  RECEIVED_AT: {
    label: "Invoice received",
    description: "When the invoice entered the system.",
  },
  VALIDATED_AT: {
    label: "Validation completed",
    description: "When the invoice was confirmed and sent for approval.",
  },
};

export const DIRECTION_INFO: Record<
  ResponseDueRuleDirection,
  { label: string; preposition: string }
> = {
  BEFORE: { label: "Before", preposition: "before" },
  AFTER: { label: "After", preposition: "after" },
};

export function formatResponseDueRule(
  anchor: string,
  offsetDays: number,
  direction: string,
): string {
  const anchorLabel =
    ANCHOR_INFO[anchor as ResponseDueRuleAnchor]?.label ?? anchor;
  const preposition =
    DIRECTION_INFO[direction as ResponseDueRuleDirection]?.preposition ?? direction.toLowerCase();
  const dayLabel = offsetDays === 1 ? "day" : "days";
  return `${offsetDays} ${dayLabel} ${preposition} ${anchorLabel.toLowerCase()}`;
}
