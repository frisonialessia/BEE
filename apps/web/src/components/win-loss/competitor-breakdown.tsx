"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { REST, TONE, tint } from "@/components/charts/palette";
import { useRowCapacity } from "@/components/charts/use-row-capacity";
import { CardLink } from "@/components/dashboard/overview-card";
import type { CompetitorStat } from "@/lib/win-loss";

/** One .bee-row of a single text-sm line: 10 + 20 + 10 padding/line; the hairline is the 1px gap. */
const ROW_HEIGHT = 40;
const ROW_GAP = 1;
/** Rows shown before "Ver todo" — the desktop cap of the collapsed list. */
const COLLAPSED_ROWS = 6;

/** Por competidor: cuántas veces le ganamos y cuántas nos ganó — la lista de
 *  "contra quién competimos de verdad". Hairline rows: the name, a thin
 *  segmented bar in honey (won at full, lost at the softest level — one hue,
 *  two strengths) and the record; only the rows that fit while collapsed. */
export function CompetitorBreakdown({ stats }: { stats: CompetitorStat[] }) {
  const t = useTranslations("forecastWinLoss.competitorBreakdown");
  const [expanded, setExpanded] = useState(false);
  const [listRef, capacity, desktop] = useRowCapacity<HTMLUListElement>(ROW_HEIGHT, ROW_GAP, { min: 4, max: COLLAPSED_ROWS });

  if (stats.length === 0) {
    return <p className="bee-caption py-6 text-center">{t("empty")}</p>;
  }

  // Desktop: every row is rendered and the capped box clips at a row
  // boundary, so the measure never depends on what is shown (see at-risk-list).
  const capped = !expanded && desktop;
  const visible = expanded || desktop ? stats : stats.slice(0, capacity);
  const hasMore = stats.length > capacity;

  return (
    <div className="flex flex-col">
      <ul ref={listRef} className="flex shrink-0 flex-col overflow-hidden" style={capped ? { maxHeight: COLLAPSED_ROWS * (ROW_HEIGHT + ROW_GAP) } : undefined}>
        {visible.map((s) => {
          const total = s.wins + s.losses;
          const winPct = total > 0 ? (s.wins / total) * 100 : 0;
          return (
            <li key={s.competitor} className="bee-row">
              <span className="w-24 shrink-0 truncate text-sm font-medium sm:w-44">{s.competitor}</span>
              <span className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: REST }} title={t("tooltip", { competitor: s.competitor, percent: Math.round(winPct), count: total })}>
                <span className="h-full transition-[width] duration-300" style={{ width: `${winPct}%`, background: TONE.market }} />
                <span className="h-full transition-[width] duration-300" style={{ width: `${100 - winPct}%`, background: tint(TONE.market, 45) }} />
              </span>
              <span className="bee-caption shrink-0 whitespace-nowrap text-right tabular-nums sm:w-36">{t("record", { wins: s.wins, losses: s.losses })}</span>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <div className="mt-2 text-right">
          <CardLink onClick={() => setExpanded((v) => !v)}>{expanded ? t("showLess") : t("viewAll", { count: stats.length })}</CardLink>
        </div>
      )}
    </div>
  );
}
