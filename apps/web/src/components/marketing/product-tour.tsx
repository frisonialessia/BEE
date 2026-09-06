"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { FeatureChart, FEATURE_HUE, type FeatureId } from "@/components/marketing-feature-charts";
import { mix, tint } from "@/components/charts/palette";
import type { Locale } from "@/i18n/locales";
import { CLOSED_OPPORTUNITY_STATUSES } from "@/types/domain";
import { getSampleBattlecards, getSampleOpportunities, getSampleSignals } from "@/lib/sample-data";

/**
 * The product, module by module, inside ONE frame instead of seven stacked
 * bands.
 *
 * The old page gave each module a full-width row: heading, one line, three
 * chips and a chart card, alternating sides. Seven of those is roughly nine
 * screens of scrolling to learn what BEE does, and each row carried three
 * chips' worth of information — a lot of page for very little said. Tabs
 * put the same seven modules in the height of one, and the space that
 * bought goes into rows of real records instead of adjectives: a visitor
 * scanning eight signals with their scores learns more in two seconds than
 * a chip reading "detección en tiempo real" ever tells them.
 *
 * Every row comes out of lib/sample-data — the same fixture the sandbox
 * runs on. Nothing here is written for the marketing page, which is the
 * point: this is the product's own data, and each panel says so.
 *
 * Colour follows the product's rule of one hue per module at 100/70/45 %
 * (see docs/DESIGN_BRIEF.md §2.1 and §2.5). The hue fills the tab, the
 * table's score cells and the stat tiles' rules; no text and no icon is
 * ever tinted, and greens stay out of every module but Ventas.
 */

type Row = {
  /** Left column — an account or a month. Truncates; never wraps. */
  key: string;
  /** Middle columns, rendered in order. Truncate individually. */
  cells: string[];
  /** 0-100. Drives the trailing cell's fill, the only number shown at rest. */
  score?: number;
};

const TABS: readonly FeatureId[] = [
  "senales",
  "crm",
  "estrategias",
  "pronostico",
  "ventas",
  "calendario",
  "control",
];

/** 100 / 70 / 45 %, the three intensities every BEE box is allowed. */
function heatFill(hue: string, score: number): string {
  return tint(hue, score >= 75 ? 100 : score >= 50 ? 70 : 45);
}

function money(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function monthLabel(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", {
    month: "short",
    year: "2-digit",
  }).format(new Date(iso));
}

export function ProductTour({ locale }: { locale: Locale }) {
  const t = useTranslations("legalMarketing.funcionalidades");
  const tTour = useTranslations("legalMarketing.funcionalidades.tour");
  // The board's own stage names, not a second copy of them on this page.
  const tStages = useTranslations("crm.board.stages");
  const activeLocale = (useLocale() as Locale) ?? locale;
  const [active, setActive] = useState<FeatureId>("senales");

  const data = useMemo(() => {
    const signals = getSampleSignals(activeLocale);
    const opps = getSampleOpportunities(activeLocale);
    const cards = getSampleBattlecards(activeLocale);
    const byOpp = new Map(cards.map((c) => [c.opportunity_id, c]));
    const named = (id: string, fallback: string) => byOpp.get(id)?.company.name ?? fallback;

    const signalTypes = t.raw("signalTypes") as Record<string, string>;
    const stage = (status: (typeof opps)[number]["status"]) => {
      if (isClosed(status)) return tStages("closed");
      const named = ["detected", "ready_to_action", "prioritized", "in_progress"];
      return named.includes(status) ? tStages(status as "detected") : status;
    };

    // "Closed" is won | lost | dismissed, not a status of its own — the one
    // shared list in types/domain.ts, never a local copy of the three.
    const isClosed = (status: (typeof opps)[number]["status"]) =>
      CLOSED_OPPORTUNITY_STATUSES.includes(status);
    const closed = opps.filter((o) => isClosed(o.status));
    const open = opps.filter((o) => !isClosed(o.status));

    // Expected close dates, grouped by month — the forecast table.
    const byMonth = new Map<string, { count: number; amount: number }>();
    for (const o of open) {
      if (!o.expected_close_date) continue;
      const k = o.expected_close_date.slice(0, 7);
      const acc = byMonth.get(k) ?? { count: 0, amount: 0 };
      acc.count += 1;
      acc.amount += o.amount ?? 0;
      byMonth.set(k, acc);
    }

    const rows: Record<FeatureId, Row[]> = {
      senales: signals.slice(0, 8).map((s) => ({
        key: s.title,
        cells: [signalTypes[s.signal_type] ?? s.signal_type],
        score: Math.round(s.score ?? 0),
      })),
      crm: open.slice(0, 8).map((o) => ({
        key: named(o.id, o.title),
        cells: [stage(o.status), money(o.amount ?? 0, activeLocale)],
        score: o.score,
      })),
      estrategias: cards.slice(0, 8).map((c) => ({
        key: c.company.name ?? "—",
        cells: [c.company.industry ?? "—", c.company.country ?? "—"],
        score: c.score,
      })),
      pronostico: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 8)
        .map(([k, v]) => ({
          key: monthLabel(`${k}-01`, activeLocale),
          cells: [tTour("opportunities", { count: v.count }), money(v.amount, activeLocale)],
          score: Math.min(100, Math.round((v.amount / 120_000) * 100)),
        })),
      ventas: closed.slice(0, 8).map((o) => ({
        key: named(o.id, o.title),
        cells: [money(o.amount ?? 0, activeLocale), o.expected_close_date ?? "—"],
        score: o.score,
      })),
      calendario: open
        .filter((o) => o.expected_close_date)
        .sort((a, b) => (a.expected_close_date ?? "").localeCompare(b.expected_close_date ?? ""))
        .slice(0, 8)
        .map((o) => ({
          key: named(o.id, o.title),
          cells: [o.expected_close_date ?? "—", stage(o.status)],
          score: o.score,
        })),
      control: cards
        .slice(0, 8)
        .map((c) => ({
          key: c.company.name ?? "—",
          cells: [
            c.manual_review_required ? tTour("reviewYes") : tTour("reviewNo"),
            c.hot_lead ? tTour("hotYes") : tTour("hotNo"),
          ],
          score: c.score,
        })),
    };

    const stats: Record<FeatureId, { label: string; value: string }[]> = {
      senales: [
        { label: tTour("stats.signals"), value: String(signals.length) },
        { label: tTour("stats.accounts"), value: String(new Set(signals.map((s) => s.company_id).filter(Boolean)).size) },
        { label: tTour("stats.qualified"), value: String(signals.filter((s) => (s.score ?? 0) >= 70).length) },
      ],
      crm: [
        { label: tTour("stats.open"), value: String(open.length) },
        { label: tTour("stats.pipeline"), value: money(open.reduce((a, o) => a + (o.amount ?? 0), 0), activeLocale) },
        { label: tTour("stats.hot"), value: String(cards.filter((c) => c.hot_lead).length) },
      ],
      estrategias: [
        { label: tTour("stats.playbooks"), value: String(cards.length) },
        { label: tTour("stats.ready"), value: String(cards.filter((c) => c.ready_to_action).length) },
        { label: tTour("stats.industries"), value: String(new Set(cards.map((c) => c.company.industry)).size) },
      ],
      pronostico: [
        { label: tTour("stats.months"), value: String(byMonth.size) },
        { label: tTour("stats.projected"), value: money([...byMonth.values()].reduce((a, v) => a + v.amount, 0), activeLocale) },
        { label: tTour("stats.open"), value: String(open.length) },
      ],
      ventas: [
        { label: tTour("stats.won"), value: String(closed.length) },
        { label: tTour("stats.revenue"), value: money(closed.reduce((a, o) => a + (o.amount ?? 0), 0), activeLocale) },
        {
          label: tTour("stats.winRate"),
          value: opps.length ? `${Math.round((closed.length / opps.length) * 100)}%` : "—",
        },
      ],
      calendario: [
        { label: tTour("stats.scheduled"), value: String(open.filter((o) => o.expected_close_date).length) },
        { label: tTour("stats.open"), value: String(open.length) },
        { label: tTour("stats.hot"), value: String(cards.filter((c) => c.hot_lead).length) },
      ],
      control: [
        { label: tTour("stats.decisions"), value: String(cards.length) },
        { label: tTour("stats.review"), value: String(cards.filter((c) => c.manual_review_required).length) },
        { label: tTour("stats.auto"), value: String(cards.filter((c) => !c.manual_review_required).length) },
      ],
    };

    return { rows, stats };
  }, [activeLocale, t, tTour, tStages]);

  const hue = FEATURE_HUE[active];
  const headers = t.raw(`sections.${active}.tableHeaders`) as string[];

  return (
    <div className="bee-bento overflow-hidden !p-0">
      {/* Tab rail. Horizontally scrollable rather than wrapping: seven tabs
          wrap to three ragged rows on a phone and the frame's top edge stops
          reading as a single control. */}
      <div
        className="flex gap-1 overflow-x-auto border-b border-[var(--color-divider)] p-2"
        role="tablist"
        aria-label={t("eyebrow")}
      >
        {TABS.map((id) => {
          const on = id === active;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(id)}
              className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium text-[var(--color-text)] transition-colors"
              style={{ background: on ? mix(FEATURE_HUE[id], 45) : "transparent" }}
            >
              {t(`sections.${id}.eyebrow`)}
            </button>
          );
        })}
      </div>

      <div className="bee-bento-pad">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{t(`sections.${active}.title`)}</h2>
          <span className="bee-micro">{t("demoBadge")}</span>
        </div>
        <p className="bee-caption mt-1 max-w-2xl">{t(`sections.${active}.caption`)}</p>

        {/* Three numbers, then the rows they summarise. Same order as every
            real page in the product (§2.11: header, then the KPI strip). */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {data.stats[active].map((s) => (
            <div
              key={s.label}
              className="rounded-xl px-3 py-2.5"
              style={{ background: mix(hue, 12), borderLeft: `3px solid ${hue}` }}
            >
              <p className="bee-micro truncate">{s.label}</p>
              <p className="mt-0.5 truncate text-lg font-semibold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_1fr]">
          {/* The dense half. Fixed header, its own scroll past eight rows, so
              a longer fixture can never stretch the frame (§2.14). */}
          <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--color-divider)]">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr style={{ background: mix(hue, 18) }}>
                  {headers.map((h, i) => (
                    <th
                      key={h}
                      className={`truncate px-3 py-2 text-left text-xs font-semibold ${i === 0 ? "w-[42%]" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows[active].map((row, i) => (
                  <tr key={`${row.key}-${i}`} className="border-t border-[var(--color-divider)]">
                    <td className="truncate px-3 py-2 font-medium" title={row.key}>
                      {row.key}
                    </td>
                    {row.cells.map((c) => (
                      <td key={c} className="truncate px-3 py-2 text-[var(--color-text-muted)]" title={c}>
                        {c}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {/* The score as a filled bar, not a number in colour —
                          §2.4 keeps every glyph in ink. */}
                      <span
                        className="block h-2 rounded-full"
                        style={{
                          width: `${Math.max(8, row.score ?? 0)}%`,
                          background: heatFill(hue, row.score ?? 0),
                        }}
                        title={`${row.score ?? 0}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* The product's own chart component, unchanged — same marks the
              dashboard draws, not an illustration of them. */}
          <div className="flex h-[260px] min-w-0 flex-col rounded-xl border border-[var(--color-divider)] p-3">
            <p className="bee-micro mb-2 truncate">{t(`sections.${active}.chart.title`)}</p>
            <div className="min-h-0 flex-1">
              <FeatureChart id={active} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
