"use client";

import {
  CheckIcon,
  PencilIcon,
  ReceiptIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type LineItemAction = "assign" | "credit" | "edit" | "approve" | "reject";

type LineItemsActionBarProps = {
  selectedCount: number;
  disabled?: boolean;
  decisionsEnabled?: boolean;
  approveDisabled?: boolean;
  rejectDisabled?: boolean;
  busyAction?: LineItemAction | null;
  onAction: (action: LineItemAction) => void;
  className?: string;
};

const ACTIONS: Array<{
  id: LineItemAction;
  label: string;
  icon: typeof UserRoundIcon;
  variant?: "default" | "outline" | "destructive" | "secondary";
}> = [
  { id: "assign", label: "Assign", icon: UserRoundIcon, variant: "outline" },
  { id: "credit", label: "Credit", icon: ReceiptIcon, variant: "outline" },
  { id: "edit", label: "Edit", icon: PencilIcon, variant: "outline" },
  { id: "approve", label: "Approve", icon: CheckIcon, variant: "default" },
  { id: "reject", label: "Reject", icon: XIcon, variant: "destructive" },
];

export function LineItemsActionBar({
  selectedCount,
  disabled = false,
  decisionsEnabled = false,
  approveDisabled = false,
  rejectDisabled = false,
  busyAction = null,
  onAction,
  className,
}: LineItemsActionBarProps) {
  const hasSelection = selectedCount > 0;
  const actionsDisabled = disabled || !hasSelection || busyAction !== null;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p
        className={cn(
          "text-sm tabular-nums",
          hasSelection ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {hasSelection
          ? `${selectedCount} line${selectedCount === 1 ? "" : "s"} selected`
          : "Select lines to run an action"}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {ACTIONS.map((action, index) => {
          const Icon = action.icon;
          const isBusy = busyAction === action.id;
          const isDecision = action.id === "approve" || action.id === "reject";
          const isDisabled =
            actionsDisabled ||
            (isDecision && !decisionsEnabled) ||
            (action.id === "approve" && approveDisabled) ||
            (action.id === "reject" && rejectDisabled);

          return (
            <div key={action.id} className="flex items-center gap-2">
              {index === 3 ? (
                <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />
              ) : null}
              <Button
                type="button"
                size="sm"
                variant={action.variant ?? "outline"}
                disabled={isDisabled}
                onClick={() => onAction(action.id)}
              >
                <Icon className="size-3.5" />
                {isBusy
                  ? action.id === "approve"
                    ? "Approving..."
                    : action.id === "reject"
                      ? "Rejecting..."
                      : action.id === "assign"
                        ? "Assigning..."
                        : action.id === "edit"
                          ? "Saving..."
                          : "Working..."
                  : action.label}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
