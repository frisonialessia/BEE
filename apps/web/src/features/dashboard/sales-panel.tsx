"use client";

import { Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { OverviewCard } from "@/components/dashboard/overview-card";
import { Sparkline } from "@/components/sparkline";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { localeTags } from "@/i18n/locales";
import { formatCurrencyUSDCompact } from "@/lib/i18n/format";
import { CLOSED_OPPORTUNITY_STATUSES, type Opportunity } from "@/types/domain";

const DAY_MS = 86_400_000;
type Period = 7 | 30 | 90;
const PERIODS: Period[] = [7, 30, 90];
const WEEKS = 8;
const MONTHS = 6;
// The three rank tones, top to bottom — amber for the leader, then the
// two BEE blues; never a fourth color.
const RANK_TONE = ["var(--color-chart-1)", "var(--color-chart-4)", "var(--color-chart-6)"];

function amount(o: Opportunity): number {
  return o.amount ?? 0;
}

function within(iso: string | null, from: number, to: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from && t < to;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Panel de ventas — the revenue read of Resumen, computed client-side
 * from the same opportunities every other box already has (no new
 * endpoint): what was won in the period and its 6-month trend, four
 * performance tiles with an 8-week sparkline each, and the team ranking
 * by won revenue. One period toggle drives all three boxes.
 */
export function SalesPanel() {
  const t = useTranslations("dashboardOverview.salesPanel");
  const locale = useLocale() as Locale;
  const { data: oppsResult } = useOpportunities(undefined, 300);
  const { data: users } = useUsers();
  const [period, setPeriod] = useState<Period>(90);
  // Captured once per mount so the memo stays pure (react-hooks/purity).
  const [now] = useState(() => Date.now());

  const opportunities = useMemo(() => oppsResult?.data ?? [], [oppsResult]);

  const model = useMemo(() => {
    const from = now - period * DAY_MS;
    const prevFrom = from - period * DAY_MS;

    const won = opportunities.filter((o) => o.status === "won");
    const lost = opportunities.filter((o) => o.status === "lost");
    const open = opportunities.filter((o) => !CLOSED_OPPORTUNITY_STATUSES.includes(o.status));

    const wonNow = won.filter((o) => within(o.closed_at, from, now));
    const wonPrev = won.filter((o) => within(o.closed_at, prevFrom, from));
    const wonValue = wonNow.reduce((s, o) => s + amount(o), 0);
    const prevValue = wonPrev.reduce((s, o) => s + amount(o), 0);
    const delta = prevValue > 0 ? (wonValue - prevValue) / prevValue : null;

    const lostNow = lost.filter((o) => within(o.closed_at, from, now));
    const closedNow = wonNow.length + lostNow.length;
    const winRate = closedNow > 0 ? wonNow.length / closedNow : null;

    const cycleDays = wonNow
      .filter((o) => o.closed_at)
      .map((o) => (new Date(o.closed_at as string).getTime() - new Date(o.created_at).getTime()) / DAY_MS);
    const avgCycle = cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null;

    const pipelineValue = open.reduce((s, o) => s + amount(o), 0);

    // Weekly series (oldest → newest) behind each tile.
    const weekly = (pick: (weekFrom: number, weekTo: number) => number) =>
      Array.from({ length: WEEKS }, (_, i) => {
        const weekTo = now - (WEEKS - 1 - i) * 7 * DAY_MS;
        return pick(weekTo - 7 * DAY_MS, weekTo);
      });
    const series = {
      won: weekly((a, b) => won.filter((o) => within(o.closed_at, a, b)).reduce((s, o) => s + amount(o), 0)),
      created: weekly((a, b) => opportunities.filter((o) => within(o.created_at, a, b)).length),
      winRate: weekly((a, b) => {
        const w = won.filter((o) => within(o.closed_at, a, b)).length;
        const l = lost.filter((o) => within(o.closed_at, a, b)).length;
        return w + l > 0 ? (w / (w + l)) * 100 : 0;
      }),
      cycle: weekly((a, b) => {
        const rows = won.filter((o) => within(o.closed_at, a, b));
        if (rows.length === 0) return 0;
        return rows.reduce((s, o) => s + (new Date(o.closed_at as string).getTime() - new Date(o.created_at).getTime()) / DAY_MS, 0) / rows.length;
      }),
    };

    // Six months of won revenue for the bars.
    const monthFmt = new Intl.DateTimeFormat(localeTags[locale], { month: "short" });
    const months = Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(now);
      d.setDate(1);
      d.setMonth(d.getMonth() - (MONTHS - 1 - i));
      const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      return {
        label: monthFmt.format(d),
        won: won.filter((o) => within(o.closed_at, start, end)).reduce((s, o) => s + amount(o), 0),
        current: i === MONTHS - 1,
      };
    });
    const maxMonth = Math.max(...months.map((m) => m.won), 1);

    const stages = [
      { key: "new", value: open.filter((o) => o.status === "detected" || o.status === "ready_to_action").reduce((s, o) => s + amount(o), 0), fill: "var(--color-chart-1)" },
      { key: "talking", value: open.filter((o) => o.status === "prioritized" || o.status === "in_progress").reduce((s, o) => s + amount(o), 0), fill: "var(--color-chart-5)" },
      { key: "won", value: wonValue, fill: "var(--color-chart-6)" },
    ];

    const byRep = new Map<string, { value: number; deals: number }>();
    for (const o of wonNow) {
      if (!o.assigned_to_user_id) continue;
      const row = byRep.get(o.assigned_to_user_id) ?? { value: 0, deals: 0 };
      row.value += amount(o);
      row.deals += 1;
      byRep.set(o.assigned_to_user_id, row);
    }
    const ranking = [...byRep.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 3)
      .map(([userId, row]) => ({
        userId,
        name: users?.find((u) => u.id === userId)?.full_name ?? t("unknownRep"),
        ...row,
      }));

    return { wonValue, delta, winRate, avgCycle, pipelineValue, series, months, maxMonth, stages, ranking };
  }, [opportunities, users, period, locale, t, now]);

  const money = (v: number) => formatCurrencyUSDCompact(v, locale);
  const periodToggle = (
    <div className="bee-filter-tabs">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPeriod(p)}
          className={`bee-filter-tab ${period === p ? "bee-filter-tab--active" : ""}`}
        >
          {t("period", { days: p })}
        </button>
      ))}
    </div>
  );

  const tiles = [
    { key: "won", value: money(model.wonValue), series: model.series.won, tone: "var(--color-chart-1)", format: money },
    { key: "pipeline", value: money(model.pipelineValue), series: model.series.created, tone: "var(--color-chart-4)", format: (v: number) => String(Math.round(v)) },
    { key: "winRate", value: model.winRate === null ? "—" : `${Math.round(model.winRate * 100)}%`, series: model.series.winRate, tone: "var(--color-chart-5)", format: (v: number) => `${Math.round(v)}%` },
    { key: "cycle", value: model.avgCycle === null ? "—" : t("days", { count: Math.round(model.avgCycle) }), series: model.series.cycle, tone: "var(--color-chart-6)", format: (v: number) => t("days", { count: Math.round(v) }) },
  ];

  return (
    <>
      <OverviewCard span={5} title={t("revenue.title")} caption={t("revenue.caption")} action={periodToggle}>
        <div className="flex h-full flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="bee-stat__val text-[var(--color-text)]">{money(model.wonValue)}</p>
            {model.delta !== null && (
              <span
                className="bee-micro rounded-full px-2 py-0.5 font-medium"
                style={{
                  background: `color-mix(in srgb, ${model.delta >= 0 ? "var(--success)" : "var(--color-chart-2)"} 18%, var(--color-card))`,
                  color: model.delta >= 0 ? "var(--success)" : "var(--color-chart-2)",
                }}
              >
                {model.delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(model.delta * 100))}% {t("vsPrevious")}
              </span>
            )}
          </div>

          {/* Six months of won revenue — the current month in the accent. */}
          <div className="flex min-h-[88px] flex-1 items-end gap-2">
            {model.months.map((m) => (
              <div key={m.label} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={money(m.won)}>
                <div className="flex h-[72px] w-full items-end">
                  <div
                    className="w-full rounded-[var(--radius-sm)]"
                    style={{
                      height: `${Math.max((m.won / model.maxMonth) * 100, m.won > 0 ? 6 : 2)}%`,
                      background: m.current ? "var(--color-chart-1)" : "color-mix(in srgb, var(--color-chart-4) 45%, var(--color-card))",
                    }}
                  />
                </div>
                <span className="bee-micro truncate">{m.label}</span>
              </div>
            ))}
          </div>

          {/* Stage value tiles — the one filled row, in the three BEE tones. */}
          <div className="grid grid-cols-3 gap-2">
            {model.stages.map((s) => (
              <div
                key={s.key}
                className="rounded-[var(--radius-md)] px-3 py-2"
                style={{ background: `color-mix(in srgb, ${s.fill} 28%, var(--color-card))` }}
              >
                <p className="bee-micro font-medium text-[var(--color-text)]">{t(`stages.${s.key}`)}</p>
                <p className="text-sm font-bold tabular-nums">{money(s.value)}</p>
              </div>
            ))}
          </div>
        </div>
      </OverviewCard>

      <OverviewCard span={4} title={t("performance.title")} caption={t("performance.caption", { days: period })}>
        <div className="grid h-full grid-cols-2 gap-3">
          {tiles.map((tile) => (
            <div key={tile.key} className="bee-bento flex flex-col justify-between gap-1 p-3">
              <span className="bee-micro inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-[var(--color-text)]" style={{ background: `color-mix(in srgb, ${tile.tone} 22%, var(--color-card))` }}>
                <span className="size-1.5 rounded-full" style={{ background: tile.tone }} />
                {t(`tiles.${tile.key}`)}
              </span>
              <div className="flex items-end justify-between gap-2">
                <p className="text-lg font-bold tabular-nums leading-none">{tile.value}</p>
                <Sparkline values={tile.series} width={64} height={22} className="shrink-0" formatValue={tile.format} />
              </div>
            </div>
          ))}
        </div>
      </OverviewCard>

      <OverviewCard span={3} title={t("ranking.title")} caption={t("ranking.caption", { days: period })}>
        {model.ranking.length === 0 ? (
          <p className="bee-caption py-6 text-center">{t("ranking.empty")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {model.ranking.map((rep, i) => (
              <li
                key={rep.userId}
                className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2"
                style={i === 0 ? { background: "color-mix(in srgb, var(--color-chart-1) 22%, var(--color-card))" } : undefined}
              >
                <span className="bee-micro w-6 font-semibold text-[var(--color-text)]">#{i + 1}</span>
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: RANK_TONE[i] }}
                >
                  {initials(rep.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1 text-sm font-medium">
                    {i === 0 && <Trophy className="size-3.5 shrink-0 text-[var(--color-chart-1)]" />}
                    <span className="truncate">{rep.name}</span>
                  </p>
                  <p className="bee-micro">{t("ranking.deals", { count: rep.deals })}</p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums">{money(rep.value)}</span>
              </li>
            ))}
          </ol>
        )}
      </OverviewCard>
    </>
  );
}
