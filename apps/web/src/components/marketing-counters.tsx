"use client";

import { useTranslations } from "next-intl";

import { DATA } from "@/components/charts/palette";
import { CountUp, Reveal } from "@/components/marketing-motion";

/**
 * MarketingCounters — the row of four stat cards right under the hero shot.
 * Every figure is honest: three are numbers the demo panel above already
 * shows (128 facts processed, 7 plays ready in the action zone, 94 % model
 * confidence) and one is an architectural fact — 6 connected sources, the
 * providers that exist in apps/api/app/services/external_api/providers/
 * (linkedin, g2, google_search, news/GDELT, hiring, website). No customer
 * counts, no user totals, no invented statistics; the note under the row
 * says which is which.
 *
 * Cards are plain .bee-bento (hairline border, white, no fills); the only
 * color is one dot per card — indigo · honey · lilac · magenta, the
 * dashboard's series order. Values live in the copy
 * (landing.counters.items.*.value) as the literal string each locale
 * prints; CountUp animates the numeric part and ends on that exact string.
 */

const COUNTERS = [
  { id: "signals", hue: DATA.indigo },
  { id: "plays", hue: DATA.honey },
  { id: "confidence", hue: DATA.violet },
  { id: "sources", hue: DATA.magenta },
] as const;

export function MarketingCounters() {
  const t = useTranslations("landing.counters");

  return (
    <Reveal className="mt-6" delay={80}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {COUNTERS.map((c, i) => (
          <div key={c.id} className="bee-bento flex min-w-0 flex-col gap-2 p-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)]">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.hue }} aria-hidden />
              <span className="truncate">{t(`items.${c.id}.label`)}</span>
            </span>
            <CountUp text={t(`items.${c.id}.value`)} className="text-2xl font-bold leading-none tracking-tight tabular-nums" duration={1400 + i * 150} />
            <p className="bee-micro truncate">{t(`items.${c.id}.hint`)}</p>
          </div>
        ))}
      </div>
      <p className="bee-micro mt-3 text-center">{t("note")}</p>
    </Reveal>
  );
}
