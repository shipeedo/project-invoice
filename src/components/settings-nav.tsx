"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SettingsNavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Setup health, shown as a small dot: green when ready, amber when action is needed. */
  status?: "ready" | "attention";
};

// The y-position (px from viewport top) a section must cross to become the
// active nav item. Roughly where the eye rests when reading a section title.
const READING_LINE_PX = 96;

type SettingsNavProps = {
  items: SettingsNavItem[];
};

export function SettingsNav({ items }: SettingsNavProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  // After a nav click, suppress scroll-spy until the smooth scroll settles so
  // the clicked item stays active while sections in between fly past.
  const spySuppressed = useRef(false);
  const suppressTimeout = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearTimeout(suppressTimeout.current);
  }, []);

  useEffect(() => {
    function onScroll() {
      if (spySuppressed.current) return;
      let current = items[0]?.id ?? "";
      for (const item of items) {
        const element = document.getElementById(item.id);
        if (element && element.getBoundingClientRect().top <= READING_LINE_PX) {
          current = item.id;
        }
      }
      // The last section may be too short to ever cross the reading line.
      const scrollable =
        document.documentElement.scrollHeight > window.innerHeight + 4;
      const scrolledToBottom =
        scrollable &&
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 4;
      if (scrolledToBottom && items.length > 0) {
        current = items[items.length - 1].id;
      }
      setActiveId(current);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  function scrollToSection(
    event: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) {
    const element = document.getElementById(id);
    if (!element) return;
    event.preventDefault();
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setActiveId(id);
    spySuppressed.current = true;
    window.clearTimeout(suppressTimeout.current);
    suppressTimeout.current = window.setTimeout(
      () => {
        spySuppressed.current = false;
      },
      prefersReducedMotion ? 100 : 700,
    );
    element.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav aria-label="Settings sections" className="lg:sticky lg:top-6">
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:px-0 lg:pb-0">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id} className="shrink-0 lg:shrink">
              <a
                href={`#${item.id}`}
                aria-current={isActive ? "true" : undefined}
                onClick={(event) => scrollToSection(event, item.id)}
                className={cn(
                  "flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "[&>svg]:size-4 [&>svg]:shrink-0",
                  isActive
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {item.icon}
                {item.label}
                {item.status ? (
                  <span
                    aria-label={
                      item.status === "ready" ? "Ready" : "Needs attention"
                    }
                    className={cn(
                      "ml-auto size-1.5 shrink-0 rounded-full",
                      item.status === "ready"
                        ? "bg-emerald-500"
                        : "bg-amber-500",
                    )}
                  />
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
