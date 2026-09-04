"use client";

import { useTranslations } from "next-intl";

import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { TONE } from "@/components/charts/palette";
import { MilestonePath } from "@/components/celebration/milestone-path";
import { OverviewCard } from "@/components/dashboard/overview-card";

/**
 * A permanent fixture at the top of Resumen, not a notice to clear — real
 * facts from the last 7 days (three tiles, a daily signals chart, one line
 * of guidance) and the all-time milestone road in the same window: one
 * place for "how's this week" and "how far has the team come", instead of
 * two cards saying similar things. No dismiss: the point is to be there
 * every time, the same way the KPI strip above it always is.
 */
export function WeeklyRecapCard({
  signals,
  won,
  streakDays,
  marketSlow,
  dailySignals,
  totalWon,
}: {
  signals: number;
  won: number;
  streakDays: number;
  marketSlow: boolean;
  dailySignals: { label: string; value: number }[];
  totalWon: number;
}) {
  const t = useTranslations("celebration.recap");

  if (signals === 0 && won === 0) return null;

  // Priority order: a real slow week first (it's the most actionable),
  // then the streak (encourage keeping it, or starting one), then a real
  // close this week, then a plain steady-state line — always a fact
  // already shown elsewhere on the page, never a new number.
  const tip = marketSlow
    ? t("tips.slow")
    : streakDays > 0
      ? t("tips.streak", { days: streakDays })
      : won > 0
        ? t("tips.won", { count: won })
        : t("tips.steady");

  return (
    <OverviewCard span={12} title={t("title")} caption={t("caption")} className="lg:min-h-0!">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
        <div className="flex gap-8 lg:flex-col lg:gap-5 lg:border-r lg:border-[var(--color-divider)] lg:pr-8">
          <div>
            <p className="bee-micro">{t("signals")}</p>
            <p className="text-xl font-bold tabular-nums">{signals}</p>
          </div>
          <div>
            <p className="bee-micro">{t("won")}</p>
            <p className="text-xl font-bold tabular-nums">{won}</p>
          </div>
          <div>
            <p className="bee-micro">{t("streak")}</p>
            <p className="text-xl font-bold tabular-nums">{streakDays}</p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="bee-micro">{t("chartCaption")}</p>
          <div className="mt-1">
            <BarsVsTarget points={dailySignals} minHeight={96} color={TONE.market} formatValue={(v) => t("signalsCount", { count: Math.round(v) })} />
          </div>
        </div>
      </div>
      <p className="bee-caption mt-5 border-t border-[var(--color-divider)] pt-4">{tip}</p>
      <div className="mt-5 border-t border-[var(--color-divider)] pt-4">
        <MilestonePath totalWon={totalWon} />
      </div>
    </OverviewCard>
  );
}
