"use client";

import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";

type InvoiceDueDateProps = {
  dueDate: Date | string | number | null;
  /** The due date stated on the invoice, present only when trading terms overrode it. */
  originalDueDate: Date | string | number | null;
  tradingTermDays: number | null;
};

/**
 * Renders the invoice due date. When the supplier's trading terms overrode the
 * due date stated on the invoice, an info tooltip explains the override.
 */
export function InvoiceDueDate({
  dueDate,
  originalDueDate,
  tradingTermDays,
}: InvoiceDueDateProps) {
  if (originalDueDate == null) {
    return <span className="font-medium">{formatDate(dueDate)}</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-medium">{formatDate(dueDate)}</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Why this due date was changed"
                className="text-muted-foreground hover:text-foreground"
              />
            }
          >
            <InfoIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>
            <span className="flex flex-col gap-0.5">
              <span>
                Due date set from the supplier&apos;s
                {tradingTermDays != null ? ` ${tradingTermDays}-day` : ""} trading
                terms.
              </span>
              <span>Invoice stated {formatDate(originalDueDate)}.</span>
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}
