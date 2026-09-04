"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Honeycomb, type HiveItem } from "@/components/charts/honeycomb";
import { HIVE_RAMP, REST, TONE, tint } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import type { Locale } from "@/i18n/locales";
import { getSignalTypeLabels } from "@/lib/format";
import { formatRelativeTime } from "@/lib/i18n/format";
import { getSampleHotLeads, getSampleSignals } from "@/lib/sample-data";
import { computeActivityGrid, getDayLabels, mostActiveCell } from "@/lib/signal-activity-grid";

const DAY_MS = 86_400_000;
const STAGES = ["ready_to_buy", "decision", "consideration", "awareness"] as const;
const STAGE_STEP: Record<(typeof STAGES)[number], number> = { ready_to_buy: 0, decision: 3, consideration: 7, awareness: 9 };

/**
 * The landing's one image: the Señales page, drawn with the product's own
 * components (StatTile, Honeycomb) over the sandbox's example data — the
 * same rows a visitor meets in /probar, so what they see here is what
 * they get. No session, no fetch: the sample modules are read directly.
 * Nothing names where signals come from.
 */
export function LandingDemo() {
  const t = useTranslations("landing.demo");
  const tHive = useTranslations("shared.intentHive");
  const locale = useLocale() as Locale;
  const [now] = useState(() => Date.now());

  const signals = useMemo(() => getSampleSignals(locale), [locale]);
  const leads = useMemo(() => getSampleHotLeads(locale), [locale]);
  const typeLabels = getSignalTypeLabels(locale);

  const recent = signals.filter((s) => now - new Date(s.detected_at).getTime() <= 30 * DAY_MS);
  const hot = signals.filter((s) => s.score >= 75).length;
  const companies = new Set(signals.map((s) => s.company_id ?? s.title)).size;
  const peak = mostActiveCell(computeActivityGrid(signals));
  const dayLabels = getDayLabels(locale);
  const weekly = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const to = now - (7 - i) * 7 * DAY_MS;
        return signals.filter((s) => {
          const d = new Date(s.detected_at).getTime();
          return d >= to - 7 * DAY_MS && d < to;
        }).length;
      }),
    [signals, now],
  );

  const items = useMemo<HiveItem[]>(
    () =>
      leads.map((l) => ({
        id: l.id,
        heat: l.research_intensity_score,
        label: l.company_name ?? l.company_domain,
        caption: `${tHive(`stages.${(STAGES as readonly string[]).includes(l.buying_stage) ? l.buying_stage : "awareness"}`)} · ${tHive("score", { score: Math.round(l.research_intensity_score) })}`,
      })),
    [leads, tHive],
  );
  const counts = useMemo(() => {
    const c: Record<(typeof STAGES)[number], number> = { ready_to_buy: 0, decision: 0, consideration: 0, awareness: 0 };
    for (const l of leads) c[(STAGES as readonly string[]).includes(l.buying_stage) ? (l.buying_stage as (typeof STAGES)[number]) : "awareness"] += 1;
    return c;
  }, [leads]);
  const maxCount = Math.max(1, ...STAGES.map((s) => counts[s]));
  const latest = [...signals].sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()).slice(0, 6);

  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-lg)] bg-[var(--color-background)] p-4 sm:p-6">
      {/* The page header, as the product draws it. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <div className="mt-1 flex items-center gap-2">
            <h3 className="bee-display">{t("listTitle")}</h3>
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-[var(--color-text)]" style={{ background: tint(TONE.market, 45) }}>
              {t("status")}
            </span>
          </div>
        </div>
        <div className="bee-tabs" aria-hidden>
          {(["feed", "priority", "intent"] as const).map((tab) => (
            <span key={tab} className="bee-tabs__tab inline-flex items-center" data-state={tab === "intent" ? "active" : "inactive"}>
              {t(`tabs.${tab}`)}
            </span>
          ))}
        </div>
      </div>

      <StatStrip cols={4}>
        <StatTile label={t("kpis.signals")} value={recent.length} hint={t("kpis.signalsHint")} trend={weekly} tone={TONE.market} />
        <StatTile label={t("kpis.hot")} value={hot} hint={t("kpis.hotHint")} tone={TONE.urgency} />
        <StatTile label={t("kpis.companies")} value={companies} hint={t("kpis.companiesHint")} tone={TONE.prepared} />
        <StatTile label={t("kpis.peak")} value={peak ? `${dayLabels[peak.day]} ${peak.hour} h` : "—"} hint={t("kpis.peakHint")} tone={TONE.forecast} />
      </StatStrip>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="bee-card lg:col-span-8">
          <div className="bee-card__head">
            <div className="min-w-0">
              <h4 className="bee-card-title !mb-0">{t("hiveTitle")}</h4>
              <p className="bee-caption truncate">{t("hiveCaption")}</p>
            </div>
          </div>
          <div className="bee-card__body">
            <Honeycomb items={items} maxRadius={30} minHeight={280} ariaLabel={tHive("aria", { count: items.length })} />
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--color-divider)] pt-4 sm:grid-cols-4">
              {STAGES.map((s) => (
                <div key={s} className="min-w-0">
                  <p className="bee-caption truncate">{tHive(`stages.${s}`)}</p>
                  <p className="text-lg font-bold leading-tight tabular-nums">{counts[s]}</p>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: REST }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round((counts[s] / maxCount) * 100)}%`, background: HIVE_RAMP[STAGE_STEP[s]] }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bee-card lg:col-span-4">
          <div className="bee-card__head">
            <div className="min-w-0">
              <h4 className="bee-card-title !mb-0">{t("latestTitle")}</h4>
              <p className="bee-caption truncate">{t("latestCaption")}</p>
            </div>
          </div>
          <div className="bee-card__body">
            <ul className="flex flex-col">
              {latest.map((s) => (
                <li key={s.id} className="bee-row">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium">{s.title}</p>
                    <p className="mt-1 flex items-center gap-2">
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-text)]" style={{ background: tint(TONE.market, 45) }}>
                        {typeLabels[s.signal_type] ?? s.signal_type}
                      </span>
                      {/* Relative to "now", which differs between server and client by seconds. */}
                      <span className="bee-caption truncate" suppressHydrationWarning>
                        {formatRelativeTime(s.detected_at, locale, new Date(now))}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
