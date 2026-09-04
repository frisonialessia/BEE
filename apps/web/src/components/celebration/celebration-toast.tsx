"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { SALES, TONE } from "@/components/charts/palette";
import type { Locale } from "@/i18n/locales";
import { formatAmount } from "@/lib/i18n/format";
import { hexagonPath } from "@/lib/visualization/honeycomb-radial";

/**
 * The one micro-celebration in BEE: a rich toast (sonner's `toast.custom`,
 * the same system every other toast in the app already uses) fired when a
 * deal is marked won. The "confetti" is six of the hive's own hexagons
 * flung from a honey centre — not generic particles — in honey and one
 * green accent (the outcome color, allowed here the same way it's allowed
 * on the CRM's own closed cards). The line is picked from a small curated
 * pool (i18n, ES/EN) and fills in the deal's own title; the amount under
 * it, when there is one, is the same currency-less number every KPI in
 * the app already shows — never a claim about the market or a rank BEE
 * can't verify.
 */
const BURST = [
  { tx: -30, ty: -16, r: 7, delay: 0, tone: "market" },
  { tx: 28, ty: -24, r: 6, delay: 40, tone: "marketDeep" },
  { tx: -20, ty: 22, r: 5, delay: 90, tone: "won" },
  { tx: 32, ty: 12, r: 7, delay: 30, tone: "market" },
  { tx: 4, ty: -32, r: 5, delay: 60, tone: "marketDeep" },
  { tx: -6, ty: 30, r: 6, delay: 100, tone: "market" },
] as const;

function toneColor(tone: (typeof BURST)[number]["tone"]): string {
  if (tone === "won") return SALES.won;
  if (tone === "marketDeep") return TONE.marketDeep;
  return TONE.market;
}

function BurstIcon() {
  return (
    <svg width="56" height="56" viewBox="-28 -28 56 56" aria-hidden className="shrink-0 overflow-visible">
      <path d={hexagonPath(0, 0, 13)} fill={TONE.marketDeep} />
      {BURST.map((p, i) => (
        <path
          key={i}
          d={hexagonPath(0, 0, p.r)}
          fill={toneColor(p.tone)}
          className="bee-celebration-hex"
          style={{ animationDelay: `${p.delay}ms`, ["--bee-celebration-tx" as string]: `${p.tx}px`, ["--bee-celebration-ty" as string]: `${p.ty}px` }}
        />
      ))}
    </svg>
  );
}

function CelebrationContent({ title, amount, locale }: { title: string; amount: number | null; locale: Locale }) {
  const t = useTranslations("celebration.toast");
  // A pool pick is random by nature — lazy useState (not useMemo, which
  // must stay pure) is the same fix HeroPanel uses for Date.now().
  const [message] = useState(() => {
    const pool = t.raw("messages") as string[];
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
    return pick.replace("{title}", title);
  });
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 pr-4 shadow-[var(--bee-shadow-card-lift)]">
      <BurstIcon />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug">{message}</p>
        {amount != null && <p className="bee-micro mt-0.5">+{formatAmount(amount, locale)}</p>}
      </div>
    </div>
  );
}

export function useCelebrateWon() {
  const locale = useLocale() as Locale;
  return (deal: { title: string; amount: number | null }) => {
    toast.custom(() => <CelebrationContent title={deal.title} amount={deal.amount} locale={locale} />, { duration: 6000 });
  };
}
