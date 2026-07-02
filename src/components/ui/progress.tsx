"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<"div"> & { value?: number }) {
  const indeterminate = value == null;

  return (
    <div
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/15",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full bg-primary",
          indeterminate
            ? "w-1/3 animate-[progress-indeterminate_1.2s_ease-in-out_infinite]"
            : "rounded-full transition-[width] duration-300 ease-out",
        )}
        style={indeterminate ? undefined : { width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export { Progress };
