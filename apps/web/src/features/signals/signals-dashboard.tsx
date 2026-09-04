"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { TONE } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { DarkFunnelTab } from "@/components/dark-funnel-dashboard";
import { LiveBadge } from "@/components/live-badge";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { SignalCard } from "@/components/signal-card";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityMatrixView } from "@/features/priority/priority-matrix-view";
import { SegmentedMix } from "@/features/signals/signal-mix";
import { useSignals } from "@/hooks/queries/use-signals";
import { usePagination } from "@/hooks/use-pagination";
import type { Locale } from "@/i18n/locales";
import { formatSignalSource, getSignalTypeLabels } from "@/lib/format";
import { computeActivityGrid, getDayLabels, mostActiveCell } from "@/lib/signal-activity-grid";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const RECENT_DAYS = 30;

/**
 * Señales — the market as BEE hears it, in three tabs that share one KPI
 * strip: the Feed (every signal as a row, and the mix by type beside it),
 * Priorización (fit × intent, the ICP's matrix) and Intención (the hive
 * with the day × hour pattern of when signals arrive). The 84-day volume
 * lives on Resumen, so nothing here repeats it. /dashboard/priority and
 * /dashboard/dark-funnel still redirect to ?tab=priority / ?tab=intent.
 */
export function SignalsDashboard() {
  const locale = useLocale() as Locale;
  const t = useTranslations("signalsStrategies.signals");
  const { data: result, isLoading, isError } = useSignals(200);
  const [now] = useState(() => Date.now());

  const signals = useMemo(() => result?.data ?? [], [result]);
  const live = result?.live ?? false;
  const pagination = usePagination(signals);

  const recent = useMemo(() => signals.filter((s) => new Date(s.detected_at).getTime() >= now - RECENT_DAYS * DAY_MS), [signals, now]);
  const weekly = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const to = now - (7 - i) * WEEK_MS;
        return signals.filter((s) => {
          const d = new Date(s.detected_at).getTime();
          return d >= to - WEEK_MS && d < to;
        }).length;
      }),
    [signals, now],
  );
  const weekDelta = weekly[6] > 0 ? (weekly[7] - weekly[6]) / weekly[6] : null;
  const hotCount = signals.filter((s) => s.score >= 75).length;
  const companiesRecent = new Set(recent.map((s) => s.company_id).filter(Boolean)).size;
  const peak = useMemo(() => mostActiveCell(computeActivityGrid(signals)), [signals]);
  const dayLabels = getDayLabels(locale);
  const peakLabel = peak ? t("kpis.peakValue", { day: dayLabels[peak.day].toLowerCase(), hour: peak.hour }) : "—";

  const typeLabels = getSignalTypeLabels(locale);
  const byType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of signals) counts.set(s.signal_type, (counts.get(s.signal_type) ?? 0) + 1);
    return [...counts.entries()].map(([key, value]) => ({ key, value, label: typeLabels[key as keyof typeof typeLabels] ?? key }));
  }, [signals, typeLabels]);
  const byIntensity = useMemo(() => {
    const bands = [
      { key: "hot", label: t("mix.bands.hot"), value: signals.filter((s) => s.score >= 75).length },
      { key: "warm", label: t("mix.bands.warm"), value: signals.filter((s) => s.score >= 50 && s.score < 75).length },
      { key: "cool", label: t("mix.bands.cool"), value: signals.filter((s) => s.score < 50).length },
    ];
    return bands;
  }, [signals, t]);
  const bySource = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of signals) counts.set(s.source, (counts.get(s.source) ?? 0) + 1);
    return [...counts.entries()].map(([key, value]) => ({ key, value, label: formatSignalSource(key, locale) }));
  }, [signals, locale]);

  const feed = isLoading ? (
    <div className="bee-overview">
      <Skeleton className="h-96 rounded-[var(--radius-lg)]" style={{ gridColumn: "span 8" }} />
      <Skeleton className="h-96 rounded-[var(--radius-lg)]" style={{ gridColumn: "span 4" }} />
    </div>
  ) : isError ? (
    <p className="bee-caption">{t("loadError")}</p>
  ) : signals.length === 0 ? (
    <div className="bee-overview">
      <OverviewCard span={12} title={t("emptyTitle")} caption={t("emptySubtitle")}>
        <p className="bee-caption">{t("emptySubtitle")}</p>
      </OverviewCard>
    </div>
  ) : (
    <div className="bee-overview">
      <OverviewCard span={8} title={t("feed.title")} caption={t("feed.caption", { count: signals.length })}>
        <ul className="bee-fill">
          {pagination.pageItems.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </ul>
        <div className="mt-4">
          <PaginationBar
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            onPageChange={pagination.goToPage}
            onPageSizeChange={pagination.changePageSize}
            itemLabel={t("itemLabel")}
          />
        </div>
      </OverviewCard>
      <OverviewCard span={4} title={t("mix.title")} caption={t("mix.caption")}>
        <div className="bee-fill flex flex-col justify-between gap-6">
          <SegmentedMix slices={byType} otherLabel={t("mix.other")} />
          <SegmentedMix slices={byIntensity} title={t("mix.byIntensity")} otherLabel={t("mix.other")} keepOrder />
          <SegmentedMix slices={bySource} title={t("mix.bySource")} otherLabel={t("mix.other")} />
        </div>
      </OverviewCard>
    </div>
  );

  return (
    <MergedPageTabs
      header={
        <header className="min-w-0">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="bee-display mt-1 truncate">{t("title")}</h1>
          <p className="bee-caption mt-1 line-clamp-2">{t("subtitle")}</p>
        </header>
      }
      actions={<LiveBadge live={live} />}
      defaultValue="feed"
      belowTabs={
        <StatStrip cols={4}>
          <StatTile label={t("kpis.recent")} value={recent.length} delta={weekDelta} deltaLabel={t("kpis.weekly")} trend={weekly} tone={TONE.market} />
          <StatTile label={t("kpis.hot")} value={hotCount} hint={t("kpis.hotHint", { count: signals.length })} tone={TONE.urgency} />
          <StatTile label={t("kpis.companies")} value={companiesRecent} hint={t("kpis.companiesHint")} tone={TONE.prepared} />
          <StatTile label={t("kpis.peak")} value={peakLabel} hint={peak ? t("kpis.peakHint", { count: peak.count }) : t("kpis.peakEmpty")} tone={TONE.forecast} />
        </StatStrip>
      }
      tabs={[
        { value: "feed", label: t("outerTabs.feed"), content: feed },
        { value: "priority", label: t("outerTabs.priority"), content: <PriorityMatrixView /> },
        { value: "intent", label: t("outerTabs.intent"), content: <DarkFunnelTab signals={signals} /> },
      ]}
    />
  );
}
