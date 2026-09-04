"use client";

import { useTranslations } from "next-intl";

import { MilestonePath } from "@/components/celebration/milestone-path";
import { DeltaChip } from "@/components/charts/delta-chip";
import { TONE } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { hexagonPath } from "@/lib/visualization/honeycomb-radial";

function StreakChip({ days }: { days: number }) {
  const t = useTranslations("celebration.streak");
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-1.5 pl-2 pr-3"
      style={{ background: `linear-gradient(135deg, ${TONE.market}, ${TONE.marketDeep})` }}
      title={days > 0 ? t("hint", { days }) : t("hintZero")}
    >
      <svg width="17" height="17" viewBox="-9 -9 18 18" aria-hidden>
        <path d={hexagonPath(0, 0, 9)} fill="#fff" />
      </svg>
      <span className="text-sm font-bold tabular-nums text-white">{days}</span>
    </span>
  );
}

function StatMini({ label, value, delta, tone }: { label: string; value: number; delta: number | null; tone?: string }) {
  return (
    <div className="flex shrink-0 items-baseline gap-2">
      <div>
        <p className="text-base font-bold leading-tight tabular-nums">{value}</p>
        <p className="bee-micro">{label}</p>
      </div>
      {delta !== null && <DeltaChip value={delta} tone={tone} />}
    </div>
  );
}

/**
 * A permanent fixture at the top of Resumen — one narrow row, entirely
 * personal (this rep's own streak, own signals, own path), not a team
 * dashboard: streak, this week's signals and closes (each with a real
 * delta against last week), then the milestone road toward this rep's
 * manager-set goal when one exists, else the next round number. No
 * dismiss — the point is to be there every time, like the KPI strip.
 */
export function WeeklyRecapCard({
  streakDays,
  signalsThisWeek,
  signalsDelta,
  wonThisWeek,
  wonDelta,
  totalWon,
  monthlyGoal,
  teamRank,
}: {
  streakDays: number;
  signalsThisWeek: number;
  signalsDelta: number | null;
  wonThisWeek: number;
  wonDelta: number | null;
  totalWon: number;
  monthlyGoal: { current: number; target: number } | null;
  teamRank: { rank: number } | null;
}) {
  const t = useTranslations("celebration.recap");

  // Always rendered, even at all-zero — a brand-new rep's own week. The
  // milestone path (a real 10 always sits at the start of the sequence)
  // and three honest zeros read as "nothing yet", not as a hole in the
  // page where the card should be.
  const caption = teamRank ? t("captionRank", { rank: teamRank.rank }) : t("caption");

  return (
    <OverviewCard span={12} title={t("title")} caption={caption} className="lg:min-h-0!">
      <div className="flex flex-wrap items-center gap-4">
        <StreakChip days={streakDays} />
        <StatMini label={t("signals")} value={signalsThisWeek} delta={signalsDelta} tone={TONE.market} />
        <StatMini label={t("won")} value={wonThisWeek} delta={wonDelta} tone="sales" />
        <div className="hidden h-8 w-px shrink-0 bg-[var(--color-divider)] sm:block" />
        <MilestonePath totalWon={totalWon} monthlyGoal={monthlyGoal} />
      </div>
    </OverviewCard>
  );
}
