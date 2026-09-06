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
      <div className="mx-auto w-full max-w-6xl px-6 py-14 lg:py-16">
        <Reveal className="max-w-3xl">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">{t("heading")}</h2>
          <p className="bee-caption mt-5 max-w-xl text-base">{t("subheading")}</p>
        </Reveal>

        {/* Three cards — the comparison, written as facts, not ticks. */}
        <Reveal stagger className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const isBee = col === "bee";
            return (
              // Sin `!h-auto`: esa clase apagaba el height:100% de
              // .bee-card, así que la tarjeta de BEE —la única con
              // gráfico— salía mucho más alta que las otras dos y las
              // tres dejaban de leerse como una comparación. Ahora la
              // fila del grid las iguala, y el gráfico se mudó abajo.
              <div
                key={col}
                className="bee-card"
                // Solo la columna de BEE lleva tono; las otras dos son la
                // referencia y no deben competir por la mirada.
                style={isBee ? { borderTop: `3px solid ${TONE.market}` } : undefined}
              >
                <p className="text-lg font-semibold">{t(`columns.${col}.title`)}</p>
                <p className="bee-caption mt-1">{t(`columns.${col}.subtitle`)}</p>
                <dl className="mt-4 divide-y divide-[var(--color-divider)] border-t border-[var(--color-divider)]">
                  {ROWS.map((row) => (
                    // Etiqueta y respuesta en la misma línea: cuatro pares
                    // apilados eran ocho renglones por tarjeta, y la
                    // comparación se leía en vertical en vez de en
                    // horizontal, que es como se compara.
                    <div key={row} className="grid grid-cols-[5.5rem_1fr] gap-3 py-2.5">
                      <dt className="bee-micro pt-0.5">{t(`rows.${row}`)}</dt>
                      <dd className={`text-sm leading-snug ${isBee ? "font-medium" : "text-[var(--color-text-muted)]"}`}>{t(`columns.${col}.${row}`)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </Reveal>

        {/* Ganado por mes: los verdes de Ventas, en su propia caja. Vivía
            dentro de la tarjeta de BEE, que es justo lo que la hacía más
            alta que sus dos vecinas. Aquí abajo cumple la misma función
            —cerrar la comparación con el número real— sin romper la fila. */}
        <Reveal className="bee-card mt-4 !h-auto" delay={60}>
          <div className="flex items-center justify-between gap-3">
            <p className="bee-eyebrow">{t("chart.title")}</p>
            <span className="bee-micro">{t("chart.caption")}</span>
          </div>
          <div className="mt-3">
            <BarsVsTarget
              points={WON.map((value, i) => ({ label: months[i], value, current: i === WON.length - 1 }))}
              target={TARGET}
              targetLabel={t("chart.target")}
              minHeight={150}
              formatValue={(v) => `${Math.round(v)} k`}
              // La misma lectura que la página de Ventas: tres verdes por fuerza.
              colorFor={(p, _i, max) => (p.value >= max * 0.66 ? SALES.won : p.value >= max * 0.33 ? SALES.lime : SALES.mint)}
            />
          </div>
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
          {/* Signup is closed (see waitlist-form.tsx) — the secondary CTA
              on /funcionalidades goes to the list, not to a refusal. */}
          <Link href="/#waitlist" className="bee-btn bee-btn--secondary">
            {t("ctaSecondary")}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
