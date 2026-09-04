"use client";

import { useRef } from "react";

import { cn } from "@/lib/utils";

export interface DrawerTab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

/** Tab strip — hairline underline in the block hue, arrow keys move
 *  between tabs (WAI-ARIA tabs pattern, automatic activation). */
export function DrawerTabs<K extends string>({
  tabs,
  value,
  onChange,
  hue,
  ariaLabel,
}: {
  tabs: DrawerTab<K>[];
  value: K;
  onChange: (key: K) => void;
  hue: string;
  ariaLabel: string;
}) {
  const refs = useRef<Map<K, HTMLButtonElement>>(new Map());

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const key = tabs[next].key;
    onChange(key);
    refs.current.get(key)?.focus();
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b border-[var(--color-divider)]">
      {tabs.map((tab, i) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              if (el) refs.current.set(tab.key, el);
            }}
            type="button"
            role="tab"
            id={`drawer-tab-${tab.key}`}
            aria-selected={active}
            aria-controls={`drawer-panel-${tab.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-chart-4)]",
              active ? "font-semibold text-[var(--color-text)]" : "border-transparent text-muted-foreground hover:text-[var(--color-text)]",
            )}
            style={active ? { borderBottomColor: hue } : undefined}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span className="bee-micro font-bold tabular-nums">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
