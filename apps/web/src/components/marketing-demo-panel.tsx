"use client";

import { useTranslations } from "next-intl";

import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { Donut } from "@/components/charts/donut";
import { DATA, mix } from "@/components/charts/palette";
import { MarketingHoneycomb } from "@/components/marketing-honeycomb";

/**
 * MarketingDemoPanel — the hero shot of the public landing: ONE view of the
 * product, Señales, framed as a window (three neutral dots, a URL chip).
 * Fixed demo data — the landing has no session, so the dashboard's
 * connected components (SignalStream, SignalHexMap…) can't be reused as-is
 * (they fetch with auth). What IS reused is the dashboard's own chart
 * components (BarsVsTarget, Donut — box-sized, hover pills) and the
 * landing hive, so a visitor who later signs in recognizes the marks.
 *
 * Color discipline (founder's rules): text and icons are ink only; brand
 * hues appear on chart marks and chip backgrounds, one hue per box — honey
 * on the signal-type chips and the weekly bars, lilac on the mix by type,
 * the hive's own cold→hot scale on the hive. Score pills are white with
 * ink text. Nothing here names a data source or provider.
 *
 * Copy lives in landing.demo.*; the fixed rows (company names, scores) stay
 * in SIGNALS and are referenced by stable `id`.
 */

export const SIGNALS = [
  { id: "northwind", company: "Northwind Robotics", type: "funding", score: 92 },
  { id: "anchor", company: "Anchor Freight", type: "intent", score: 88 },
  { id: "solace", company: "Solace Data", type: "keyHire", score: 85 },
  { id: "vantage", company: "Vantage Health", type: "hiring", score: 78 },
  { id: "fielder", company: "Fielder Logistics", type: "stack", score: 41 },
] as const;

export type SignalRow = (typeof SIGNALS)[number];

// Eight weeks of detected signals — the last one is the current week.
const WEEKLY = [14, 18, 16, 22, 25, 23, 29, 34] as const;

// Share of signals by type (adds up to 100).
const MIX = [
  { type: "funding", value: 32 },
  { type: "hiring", value: 26 },
  { type: "intent", value: 24 },
  { type: "stack", value: 18 },
] as const;

// Same stops, same order, as the landing hive (marketing-honeycomb.tsx
// TEMP_STOPS): pale honey → honey → deep honey → lilac → magenta.
const HEAT_SWATCHES = ["--color-chart-3", "--color-chart-1", "--color-chart-2", "--color-chart-6", "--color-chart-5"] as const;

/** White pill, ink text — the score never carries a color. */
export function ScorePill({ score }: { score: number }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--color-text)]">
      {score}
    </span>
  );
}

/** Signal-type chip — honey wash behind ink text (a chip background is the
 *  one place a hue may sit behind text). */
export function TypeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-micro font-medium text-[var(--color-text)]" style={{ background: mix(DATA.honeyFill, 28) }}>
      {label}
    </span>
  );
}

export function SignalList({ rows = SIGNALS, compact = false }: { rows?: readonly SignalRow[]; compact?: boolean }) {
  const t = useTranslations("landing.demo");
  return (
    <ul className="divide-y divide-[var(--color-divider)]">
      {rows.map((s) => (
        <li key={s.id} className={`flex items-center gap-3 ${compact ? "py-2" : "py-2.5"}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{s.company}</p>
            <p className="bee-micro truncate">{t(`signals.${s.id}`)}</p>
          </div>
          <span className="hidden sm:inline-flex">
            <TypeChip label={t(`types.${s.type}`)} />
          </span>
          <span className="bee-micro hidden w-10 text-right md:block">{t(`times.${s.id}`)}</span>
          <ScorePill score={s.score} />
        </li>
      ))}
    </ul>
  );
}

export function MarketingDemoPanel() {
  const t = useTranslations("landing.demo");

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
      {/* Window bar: three neutral dots, a URL chip, "sample data". */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[var(--color-border)]" aria-hidden />
          <span className="size-2.5 rounded-full bg-[var(--color-border)]" aria-hidden />
          <span className="size-2.5 rounded-full bg-[var(--color-border)]" aria-hidden />
          <span className="bee-micro ml-2 hidden rounded-sm border border-[var(--color-divider)] px-2 py-0.5 sm:inline">app.bee.io/senales</span>
        </div>
        <span className="bee-micro">{t("status")}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 lg:grid-cols-12">
        {/* Señales — the list, score pills on the right. */}
        <div className="bee-bento bee-bento-pad flex flex-col lg:col-span-7">
          <div className="flex items-center justify-between gap-3">
            <p className="bee-eyebrow">{t("listTitle")}</p>
            <span className="bee-micro">{t("listToday", { count: 6 })}</span>
          </div>
          <div className="mt-1">
            <SignalList />
          </div>
        </div>

        {/* Colmena — the hive with its cold → hot legend. */}
        <div className="bee-bento bee-bento-pad flex flex-col lg:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <p className="bee-eyebrow">{t("hiveTitle")}</p>
            <div className="bee-micro flex items-center gap-1.5">
              <span>{t("cold")}</span>
              <span className="flex items-center gap-0.5" aria-hidden>
                {HEAT_SWATCHES.map((v) => (
                  <span key={v} className="size-1.5 rounded-full" style={{ background: `var(${v})` }} />
                ))}
              </span>
              <span>{t("hot")}</span>
            </div>
          </div>
          <div className="mt-2 flex h-44 flex-1 items-center justify-center">
            <MarketingHoneycomb />
          </div>
        </div>

        {/* Señales por semana — honey bars, the current week at full strength. */}
        <div className="bee-bento bee-bento-pad flex flex-col lg:col-span-7">
          <p className="bee-eyebrow">{t("weeklyTitle")}</p>
          <p className="bee-caption mt-0.5">{t("weeklyCaption")}</p>
          <div className="mt-3 flex-1">
            <BarsVsTarget
              points={WEEKLY.map((value, i) => ({ label: t("week", { n: i + 1 }), value, current: i === WEEKLY.length - 1 }))}
              minHeight={150}
              formatValue={(v) => t("signalsCount", { count: Math.round(v) })}
              colorFor={(p) => (p.current ? DATA.honey : mix(DATA.honey, 45))}
            />
          </div>
        </div>

        {/* Mezcla por tipo — lilac, four strengths of the one hue. */}
        <div className="bee-bento bee-bento-pad flex flex-col lg:col-span-5">
          <p className="bee-eyebrow">{t("mixTitle")}</p>
          <p className="bee-caption mt-0.5">{t("mixCaption")}</p>
          <div className="mt-3 flex flex-1 items-center">
            <Donut
              slices={MIX.map((m, i) => ({ label: t(`types.${m.type}`), value: m.value, color: mix(DATA.violet, [100, 70, 45, 28][i]) }))}
              size={104}
              centerLabel="100%"
              otherLabel={t("other")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
