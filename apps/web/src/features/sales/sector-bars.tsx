"use client";

import { useLocale, useTranslations } from "next-intl";

import { REST, SALES, mix } from "@/components/charts/palette";
import type { Locale } from "@/i18n/locales";
import { formatAmount } from "@/lib/i18n/format";
import type { SalesSector } from "@/lib/sales-model";

// The three greens by rank, like the team ranking: the sector that pays
// most in the main green, the next in lime, the rest in mint.
const RANK_TONE = [SALES.won, SALES.lime, SALES.mint];
const rankTone = (i: number) => RANK_TONE[Math.min(i, RANK_TONE.length - 1)];

/**
 * Ventas por sector — where the money came from in the window: one row per
 * sector of the accounts won, bar width = share of the largest, with the
 * deal count and the amount at the right, in the same columns the team
 * ranking beside it uses so both boxes read as one table.
 */
export function SectorBars({ sectors, limit = 8 }: { sectors: SalesSector[]; limit?: number }) {
  const t = useTranslations("sales.sectors");
  const locale = useLocale() as Locale;
  if (sectors.length === 0) return <p className="bee-caption py-6 text-center">{t("empty")}</p>;
  const rows = sectors.slice(0, limit);
  const max = Math.max(1, ...rows.map((s) => s.value));
  const total = sectors.reduce((s, x) => s + x.value, 0);
  return (
    <ol className="bee-fill flex flex-col justify-evenly">
      {rows.map((s, i) => {
        const tone = rankTone(i);
        const share = total ? Math.round((s.value / total) * 100) : 0;
        return (
          <li key={s.name || "—"} className="bee-row grid grid-cols-[1.25rem_minmax(0,1fr)_4.5rem] items-center gap-3 px-2">
            <span className="bee-micro font-semibold text-[var(--color-text)]">#{i + 1}</span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{s.name || t("noSector")}</span>
                <span className="shrink-0 rounded-full px-2 py-0.5 bee-micro font-medium text-[var(--color-text)]" style={{ background: mix(tone, 45) }}>
                  {t("deals", { count: s.count })}
                </span>
              </p>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: REST }} title={`${s.name || t("noSector")} · ${formatAmount(s.value, locale, false)} · ${share}%`}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.round((s.value / max) * 100))}%`, background: tone }} />
              </div>
            </div>
            <span className="text-right text-sm font-bold tabular-nums">{formatAmount(s.value, locale)}</span>
          </li>
        );
      })}
    </ol>
  );
}
