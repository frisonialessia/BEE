"use client";

import { useTranslations } from "next-intl";

import { CountUp, Reveal } from "@/components/marketing-motion";

/**
 * MarketingCounters — a band of four figures that count up as they scroll
 * into view, right under the Demo en vivo. Every number is one the demo
 * panel above already shows (128 facts processed, 7 plays ready in the
 * action zone, 3 hot leads, 94 % model confidence) — the band recaps the
 * demo, it does not introduce a second set of statistics — and the note
 * says so in plain words. No customer metrics, no invented totals.
 *
 * Values live in the copy (landing.counters.items.*.value) as the literal
 * string each locale prints ("94 %" vs "94%"); CountUp animates the
 * numeric part and ends on that exact string.
 */

const COUNTERS = [
  { id: "signals", color: "var(--color-chart-4)" },
  { id: "plays", color: "var(--color-chart-1)" },
  { id: "hot", color: "var(--color-chart-5)" },
  { id: "confidence", color: "var(--color-chart-6)" },
] as const;

export function MarketingCounters() {
  const t = useTranslations("landing.counters");

  return (
    <Reveal className="mt-6">
      <div className="bee-glass grid grid-cols-2 gap-y-6 rounded-[var(--radius-lg)] px-5 py-6 sm:px-8 lg:grid-cols-4 lg:gap-y-0">
        {COUNTERS.map((c, i) => (
          <div key={c.id} className={`flex flex-col items-center text-center ${i > 0 ? "lg:border-l lg:border-[var(--color-divider)]" : ""}`}>
            <span className="mb-2 size-2 rounded-full" style={{ background: c.color }} aria-hidden />
            <CountUp text={t(`items.${c.id}.value`)} className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl" duration={1400 + i * 150} />
            <p className="bee-caption mt-1.5 max-w-[11rem] text-xs">{t(`items.${c.id}.label`)}</p>
          </div>
        ))}
      </div>
      <p className="bee-micro mt-3 text-center">{t("note")}</p>
    </Reveal>
  );
}
