"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { AreaChart } from "@/components/charts/area-chart";
import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { SALES, TONE } from "@/components/charts/palette";
import { Reveal } from "@/components/marketing-motion";

/**
 * MarketingSales — the closing argument for /funcionalidades (moved there
 * from the homepage when the landing became a single, scroll-free
 * viewport — see app/page.tsx and hero-bento.tsx, which carries this same
 * WON figure as one of its small cards): "Los CRM registran ventas. BEE
 * las cierra." It argues the difference against the two things
 * a buyer already has — a CRM and an intent / enrichment tool — as three
 * cards side by side (not a table), four one-line facts each: where the
 * lead comes from, the next step, prioritization, the close. The BEE card
 * is slightly elevated (shadow, honey hairline on top) and carries a small
 * BarsVsTarget of won per month — the one place in the section the greens
 * appear, the same three-by-strength read the real Ventas page uses,
 * because this chart is that page's own number (won revenue), not
 * decoration. Under it, the simulator on white: a segmented control
 * (×1 · ×1.5 · ×2 prospecting) and the projection, in honey — a forecast,
 * not closed revenue, so it stays out of the greens.
 *
 * Color: the segmented control's active state is the lavender selection
 * wash with ink text; blue is the primary button, nothing else. Every
 * figure is illustrative and the copy says so.
 */

const COLUMNS = ["crm", "intent", "bee"] as const;
const ROWS = ["origin", "next", "priority", "close"] as const;
const MONTH_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6"] as const;

const WON = [32, 38, 41, 45, 52, 58] as const;
const TARGET = 50;

const FACTORS = [1, 1.5, 2] as const;
type Factor = (typeof FACTORS)[number];
// Deals closed per month at ×1 prospecting; the multiplier scales the ramp.
const BASE = [12, 13, 15, 17, 20, 23] as const;

function projection(factor: Factor): number[] {
  // Smooth ramp: the first month barely moves (deals in flight), the rest
  // grows with the multiplier — a projection, not a straight line.
  return BASE.map((v, i) => {
    const k = (i + 1) / BASE.length;
    const eased = k * k * (3 - 2 * k);
    return Math.round(v * (1 + (factor - 1) * eased));
  });
}

export function MarketingSales() {
  const t = useTranslations("landing.sales");
  const months = MONTH_KEYS.map((k) => t(`months.${k}`));
  const [factor, setFactor] = useState<Factor>(1.5);
  const points = projection(factor);
  const total = points.reduce((s, v) => s + v, 0);

  // id "ventas-comparacion", not "ventas": /funcionalidades already has its
  // own #ventas anchor on the per-module Ventas section, and this
  // component now renders further down that same page — two elements
  // can't share one id.
  return (
    <section id="ventas-comparacion" className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-28">
        <Reveal className="max-w-3xl">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">{t("heading")}</h2>
          <p className="bee-caption mt-5 max-w-xl text-base">{t("subheading")}</p>
        </Reveal>

        {/* Three cards — the comparison, written as facts, not ticks. */}
        <Reveal stagger className="mt-12 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const isBee = col === "bee";
            return (
              <div
                key={col}
                className="bee-card !h-auto"
              >
                <p className="text-lg font-semibold">{t(`columns.${col}.title`)}</p>
                <p className="bee-caption mt-1">{t(`columns.${col}.subtitle`)}</p>
                <dl className="mt-5 divide-y divide-[var(--color-divider)] border-t border-[var(--color-divider)]">
                  {ROWS.map((row) => (
                    <div key={row} className="py-3">
                      <dt className="bee-micro">{t(`rows.${row}`)}</dt>
                      <dd className={`mt-0.5 text-sm ${isBee ? "font-medium" : "text-[var(--color-text-muted)]"}`}>{t(`columns.${col}.${row}`)}</dd>
                    </div>
                  ))}
                </dl>
                {isBee && (
                  <div className="mt-5 border-t border-[var(--color-divider)] pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="bee-eyebrow">{t("chart.title")}</p>
                      <span className="bee-micro">{t("chart.caption")}</span>
                    </div>
                    <div className="mt-2">
                      <BarsVsTarget
                        points={WON.map((value, i) => ({ label: months[i], value, current: i === WON.length - 1 }))}
                        target={TARGET}
                        targetLabel={t("chart.target")}
                        minHeight={130}
                        formatValue={(v) => `${Math.round(v)} k`}
                        // Same reading as the real Ventas page: three greens by strength.
                        colorFor={(p, _i, max) => (p.value >= max * 0.66 ? SALES.won : p.value >= max * 0.33 ? SALES.lime : SALES.mint)}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Reveal>

        {/* Simulator — on white; the active factor takes the lavender selection wash. */}
        <Reveal className="bee-card mt-6 !h-auto" delay={80}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">{t("simulator.title")}</p>
              <p className="bee-caption mt-1">{t("simulator.caption")}</p>
            </div>
            <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--color-divider)] p-0.5" role="group" aria-label={t("simulator.groupAria")}>
              {FACTORS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFactor(f)}
                  aria-pressed={factor === f}
                  className={`rounded-[calc(var(--radius-sm)-2px)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition-colors ${
                    factor === f ? "bg-[var(--color-primary)]" : "hover:bg-[var(--color-background)]"
                  }`}
                >
                  {t("simulator.factor", { factor: f })}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_16rem]">
            <div className="min-h-44">
              <AreaChart
                points={points.map((value, i) => ({ label: months[i], value }))}
                color={TONE.market}
                minHeight={176}
                formatValue={(v) => t("simulator.deals", { count: Math.round(v) })}
              />
            </div>
            <div className="flex flex-col justify-center gap-3 border-t border-[var(--color-divider)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <div>
                <p className="bee-micro">{t("simulator.totalLabel")}</p>
                <p className="text-2xl font-semibold tabular-nums tracking-tight">{t("simulator.deals", { count: total })}</p>
              </div>
              <div>
                <p className="bee-micro">{t("simulator.lastLabel")}</p>
                <p className="text-2xl font-semibold tabular-nums tracking-tight">{t("simulator.deals", { count: points[points.length - 1] })}</p>
              </div>
              <p className="bee-caption text-xs">{t("simulator.note", { factor })}</p>
            </div>
          </div>
          <p className="bee-micro mt-4">{t("illustrative")}</p>
        </Reveal>

        <Reveal className="mt-10 flex flex-wrap items-center gap-3" delay={120}>
          <Link href="/probar/sales" className="bee-btn bee-btn--primary bee-cta-lift">
            {t("cta")}
          </Link>
          <Link href="/register" className="bee-btn bee-btn--secondary">
            {t("ctaSecondary")}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
