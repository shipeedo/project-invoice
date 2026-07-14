"use client";

import { useState } from "react";
import type { SpreadsheetPreview } from "@/lib/attachment-preview";
import { cn } from "@/lib/utils";

type SpreadsheetPreviewGridProps = {
  preview: SpreadsheetPreview;
  className?: string;
  /** Height cap for the scrollable table area; pass "max-h-none" when the
   * parent (e.g. the viewer dialog) constrains the height instead. */
  scrollAreaClassName?: string;
};

/**
 * Grid for a bounded spreadsheet preview: one sheet visible at a time with
 * Excel-style sheet tabs along the bottom. Usable from server components
 * (inline previews) and client components (the file viewer dialog) alike.
 */
export function SpreadsheetPreviewGrid({
  preview,
  className,
  scrollAreaClassName = "max-h-[60vh]",
}: SpreadsheetPreviewGridProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const sheet = preview.sheets[Math.min(activeIndex, preview.sheets.length - 1)];
  if (!sheet) return null;
  const showFooter = preview.sheets.length > 1 || sheet.truncated;

  return (
    <div
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border",
        className,
      )}
    >
      {/* Plain table (not the shadcn Table wrapper): the wrapper's own
          overflow container would break position:sticky against this
          scroll area, and border-separate keeps the header's borders
          attached while the body scrolls underneath. */}
      <div className={cn("min-h-0 flex-1 overflow-auto", scrollAreaClassName)}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          {sheet.rows.length > 0 ? (
            <thead>
              <tr>
                {sheet.rows[0].map((cell, cellIndex) => (
                  <th
                    key={cellIndex}
                    className="sticky top-0 z-10 border-r border-b bg-muted px-2.5 py-2 text-left text-xs font-semibold whitespace-nowrap last:border-r-0"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {sheet.rows.slice(1).map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-muted/30">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border-r border-b px-2.5 py-1.5 whitespace-nowrap tabular-nums last:border-r-0"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showFooter ? (
        <div className="flex shrink-0 items-center border-t bg-muted/50">
          {preview.sheets.length > 1 ? (
            <div
              className="flex min-w-0 flex-1 items-center overflow-x-auto"
              role="tablist"
              aria-label="Sheets"
            >
              {preview.sheets.map((tab, index) => (
                <button
                  key={tab.name}
                  type="button"
                  role="tab"
                  aria-selected={index === activeIndex}
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "border-r px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
                    index === activeIndex
                      ? "bg-background font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          ) : null}
          {sheet.truncated ? (
            <p className="ml-auto px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground">
              Preview truncated — open the file for the full data.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
