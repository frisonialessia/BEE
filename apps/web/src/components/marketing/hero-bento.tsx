"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Honeycomb } from "@/components/charts/honeycomb";
import { SALES, TONE } from "@/components/charts/palette";
import { hexagonPath } from "@/lib/visualization/honeycomb-radial";
import type { Locale } from "@/i18n/locales";
import { getSampleHotLeads, getSampleSignals } from "@/lib/sample-data";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
// Same illustrative shape as the Ventas comparison's own chart
// (marketing-sales.tsx's WON/TARGET) — same data, same three-greens-by-
// strength read, so a visitor who scrolls to /funcionalidades later sees
// the identical number, not a second invented one.
const SALES_WON = [32, 38, 41, 45, 52, 58] as const;
const SALES_TARGET = 50;

/**
 * The single-viewport homepage's one piece of "product, not paragraphs" —
 * five small real-BEE cards below the hero, replacing the reference
 * screenshot's stock-photo bento with fragments of BEE's own components:
 * a signals trend, the honeycomb with a live hot account, the copilot's
 * "jugada lista" (same idiom as HeroPanel's own play badge), the Ventas
 * chart, and the team's streak (same StreakChip idiom as Resumen's weekly
 * recap). Nothing invented — every number is real sample data, same
 * source HeroPanel/LandingDemo/MarketingSales already use — a mini chip
 * ("ejemplo") says so on any figure that isn't literally counted live.
 *
 * Deliberately lightweight custom bars instead of AreaChart/BarsVsTarget:
 * those size themselves via a ResizeObserver meant for a much bigger box
 * (see use-box-size) — at this card's ~70px chart area a plain div bar is
 * simpler and never mismeasures. The honeycomb is the one real chart
 * component reused as-is (HeroPanel already proves it works this small).
 */
export function HeroBento({ locale }: { locale: Locale }) {
  const t = useTranslations("landing.hero.cards");
  const [now] = useState(() => Date.now());

  const signals = getSampleSignals(locale);
  const leads = getSampleHotLeads(locale);
  const recentSignals = signals.filter((s) => now - new Date(s.detected_at).getTime() <= 30 * DAY_MS).length;

  // Six weekly buckets, oldest first, for the trend card's mini bars.
  const weeklyBuckets = Array.from({ length: 6 }, (_, i) => {
    const end = now - (5 - i) * WEEK_MS;
    const start = end - WEEK_MS;
    return signals.filter((s) => {
      const t2 = new Date(s.detected_at).getTime();
      return t2 > start && t2 <= end;
    }).length;
  });
  const maxWeekly = Math.max(...weeklyBuckets, 1);

  const hotLead = leads.find((l) => l.id === "h1") ?? leads[0];
  const hiveItems = leads.slice(0, 19).map((l) => ({ id: l.id, heat: l.research_intensity_score, label: l.company_name ?? l.company_domain }));

  const maxSalesWon = Math.max(...SALES_WON, SALES_TARGET);
  const streakDays = 12; // ejemplo — same StreakChip idiom celebration/weekly-recap-card.tsx uses for real

  return (
    <div className="mt-8 grid w-full grid-cols-3 gap-2.5 sm:mt-10 sm:grid-cols-5 sm:gap-3.5 lg:mt-16 lg:gap-5">
      {/* Trend — hidden on phone: five thin bars leave little room for a
          label, and the two cards kept (hive, play) already carry the
          "señales → jugada" story on their own at that width. */}
      <div className="bee-bento-mini hidden sm:flex sm:flex-col">
        <p className="bee-micro truncate">{t("trend.eyebrow")}</p>
        <p className="mt-1 text-lg font-bold tabular-nums leading-none sm:text-xl lg:text-2xl">{recentSignals}</p>
        <div className="mt-auto flex h-9 items-end gap-1" aria-hidden>
          {weeklyBuckets.map((v, i) => (
            <i
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max(12, (v / maxWeekly) * 100)}%`,
                background: i === weeklyBuckets.length - 1 ? TONE.marketDeep : TONE.market,
              }}
            />
          ))}
        </div>
      </div>

      {/* Hive + hot account — the one card every breakpoint keeps: BEE's
          own identity mark, not a stock icon. */}
      <div className="bee-bento-mini col-span-1 flex flex-col">
        <div className="flex items-center justify-between gap-1">
          <p className="bee-micro truncate">{t("hive.eyebrow")}</p>
          <span className="flex shrink-0 items-center gap-1">
            <i className="size-1.5 animate-pulse rounded-full" style={{ background: TONE.urgency }} aria-hidden />
            <span className="bee-micro">{t("hive.live")}</span>
          </span>
        </div>
        <div className="mt-1 flex items-center justify-center">
          <Honeycomb items={hiveItems} maxRadius={8} minHeight={60} ariaLabel={t("hive.aria")} />
        </div>
        {hotLead && <p className="mt-1 truncate text-center text-xs font-semibold">{hotLead.company_name ?? hotLead.company_domain}</p>}
      </div>

      {/* Copilot "jugada lista" — same idiom as HeroPanel's play badge. */}
      <div className="bee-bento-mini col-span-1 flex flex-col">
        <p className="bee-micro truncate">{t("play.eyebrow")}</p>
        <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{t("play.text")}</p>
        <div className="mt-auto flex gap-1 pt-2" aria-hidden>
          {[1, 2, 3].map((i) => (
            <i key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < 3 ? TONE.prepared : "color-mix(in srgb, var(--color-text) 14%, transparent)" }} />
          ))}
        </div>
      </div>

      {/* Ventas — same figure and coloring as the Ventas comparison
          section's own chart (marketing-sales.tsx), just smaller. */}
      <div className="bee-bento-mini hidden sm:flex sm:flex-col">
        <p className="bee-micro truncate">{t("sales.eyebrow")}</p>
        <p className="mt-1 text-lg font-bold tabular-nums leading-none sm:text-xl lg:text-2xl">+{Math.round(((SALES_WON.at(-1)! - SALES_WON[0]) / SALES_WON[0]) * 100)}%</p>
        <div className="mt-auto flex h-9 items-end gap-1" aria-hidden>
          {SALES_WON.map((v, i) => (
            <i
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max(12, (v / maxSalesWon) * 100)}%`,
                background: v >= maxSalesWon * 0.66 ? SALES.won : v >= maxSalesWon * 0.33 ? SALES.lime : SALES.mint,
              }}
            />
          ))}
        </div>
      </div>

      {/* Racha del equipo — same StreakChip idiom as Resumen's weekly
          recap (celebration/weekly-recap-card.tsx), same gradient, same
          hexagon mark, illustrative count on the landing. */}
      <div
        className="bee-bento-mini col-span-1 flex flex-col justify-center text-center"
        style={{ background: `linear-gradient(135deg, ${TONE.market}, ${TONE.marketDeep})` }}
      >
        <div className="flex items-center justify-center gap-1.5">
          <svg width="14" height="14" viewBox="-9 -9 18 18" aria-hidden>
            <path d={hexagonPath(0, 0, 9)} fill="#fff" />
          </svg>
          <span className="text-base font-bold tabular-nums text-white">{streakDays}</span>
        </div>
        <p className="mt-1 text-xs font-medium text-white/90">{t("streak.eyebrow")}</p>
      </div>
    </div>
  );
}
