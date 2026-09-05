"use client";

import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Honeycomb } from "@/components/charts/honeycomb";
import { SALES, TONE } from "@/components/charts/palette";
import { hexagonPath } from "@/lib/visualization/honeycomb-radial";
import type { Locale } from "@/i18n/locales";
import { getSampleHotLeads, getSampleSignals } from "@/lib/sample-data";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
// Same illustrative shape as the Ventas comparison's own chart
// (marketing-sales.tsx's WON/TARGET) — same data, same three-greens-by-
// strength read, so a visitor who scrolls to /funcionalidades later sees
// the identical number, not a second invented one.
const SALES_WON = [32, 38, 41, 45, 52, 58] as const;
const SALES_TARGET = 50;

/**
 * The single-viewport homepage's one piece of "product, not paragraphs" —
 * a 12-card collage below the hero, matching the founder's reference
 * (scattered, tilted, overlapping cards on a colour wash) at 12 cards
 * instead of the 5 this used to ship. Nothing invented: every number is
 * real sample data (same source HeroPanel/LandingDemo/MarketingSales
 * already use) or a straight reuse of copy that already ships on
 * /funcionalidades (`landing.hero.differentiators`) — the two smallest
 * cards ("Antes de que exista el lead", "Aprende de cada cierre") are
 * literally that copy, verbatim.
 *
 * Absolute-positioned, hand-placed (not a grid): fitting 12 legible cards
 * in the same footprint the reference gives ~6 means real overlap, and a
 * grid can't produce the reference's scattered-corners look. Positions
 * were chosen so only shadows and empty corners ever touch — never one
 * card's text sitting under another (verified visually; see the PR this
 * shipped in for screenshots at 1440×900, 1366×768 and the tightest case,
 * 1440×700).
 *
 * Two layouts, not one compressed by breakpoint: sm+ gets the full 12-card
 * collage; phones get a plain 4-card row instead — an absolutely-
 * positioned scatter has no graceful narrow-width fallback, so below sm
 * it's a different, simpler tree entirely rather than the same one
 * squeezed.
 *
 * Deliberately lightweight custom bars/dots instead of AreaChart/
 * BarsVsTarget: those size themselves via a ResizeObserver meant for a
 * much bigger box (see use-box-size) — at these cards' tiny chart areas a
 * plain div bar is simpler and never mismeasures. The honeycomb is the
 * one real chart component reused as-is (HeroPanel already proves it
 * works this small).
 *
 * Every card sets its own `height` (and here, `top`/`left`/`width`) via
 * inline `style`, never a Tailwind utility: `.bee-bento-mini`
 * (globals.css) is a plain, un-layered rule, and those always win a
 * cascade tie against a layered Tailwind utility on the same element
 * regardless of source order — inline style is the one thing that
 * reliably overrides it, including its default padding (too generous for
 * a card this small, so it's overridden inline per card).
 */
export function HeroBento({ locale }: { locale: Locale }) {
  const t = useTranslations("landing.hero.cards");
  const tDiff = useTranslations("landing.hero.differentiators");
  const tConf = useTranslations("shared.cyclePrediction.confidence");
  const [now] = useState(() => Date.now());

  const signals = getSampleSignals(locale);
  const leads = getSampleHotLeads(locale);
  const recentSignals = signals.filter((s) => now - new Date(s.detected_at).getTime() <= 30 * DAY_MS).length;

  // Six weekly buckets, oldest first, for the trend card's mini bars.
  const weeklyBuckets = Array.from({ length: 6 }, (_, i) => {
    const end = now - (5 - i) * WEEK_MS;
    const start = end - WEEK_MS;
    return signals.filter((s) => {
      const t2 = new Date(s.detected_at).getTime();
      return t2 > start && t2 <= end;
    }).length;
  });
  const maxWeekly = Math.max(...weeklyBuckets, 1);
  // Honest delta: only shown when the first week had a real baseline to
  // divide by — never a fabricated "+N%" against a zero.
  const weeklyDeltaPct = weeklyBuckets[0] > 0 ? Math.round(((weeklyBuckets.at(-1)! - weeklyBuckets[0]) / weeklyBuckets[0]) * 100) : null;

  const hotLead = leads.find((l) => l.id === "h1") ?? leads[0];
  const hiveItems = leads.slice(0, 19).map((l) => ({ id: l.id, heat: l.research_intensity_score, label: l.company_name ?? l.company_domain }));

  const maxSalesWon = Math.max(...SALES_WON, SALES_TARGET);
  // Same illustrative pair as "¿Qué pasa si...?", read off the same
  // SALES_WON series: an early-period average as the base, the latest
  // point as "with the signal" — not a second invented dataset.
  const baseAvg = Math.round((SALES_WON[0] + SALES_WON[1] + SALES_WON[2]) / 3);
  const withSignal = SALES_WON.at(-1)!;

  // Confidence reads off the actual featured lead's real buying stage —
  // never a hardcoded "Alta" regardless of who's shown.
  const confidenceKey = hotLead?.buying_stage === "ready_to_buy" ? "high" : hotLead?.buying_stage === "decision" ? "medium" : "low";

  // Which signal types are genuinely present today, up to 4 — the score
  // card's source dots reflect real variety, not a fixed decorative count.
  const sourceTones = [TONE.market, TONE.forecast, TONE.prepared, TONE.urgency];
  const presentTypes = Array.from(new Set(signals.map((s) => s.signal_type))).slice(0, 4);

  const hiveInner = (
    <>
      <div className="flex items-center justify-between gap-1">
        <p className="bee-micro truncate">{t("hive.eyebrow")}</p>
        <span className="flex shrink-0 items-center gap-1">
          <i className="size-1.5 animate-pulse rounded-full" style={{ background: TONE.urgency }} aria-hidden />
          <span className="bee-micro">{t("hive.live")}</span>
        </span>
      </div>
      <div className="mt-1 flex flex-1 items-center justify-center">
        <Honeycomb items={hiveItems} maxRadius={13} minHeight={110} ariaLabel={t("hive.aria")} />
      </div>
      {hotLead && <p className="mt-1 truncate text-center text-xs font-semibold">{hotLead.company_name ?? hotLead.company_domain}</p>}
    </>
  );

  const trendInner = (
    <>
      <p className="bee-micro truncate">{t("trend.eyebrow")}</p>
      <p className="mt-1 text-lg font-bold tabular-nums leading-none">{recentSignals}</p>
      {weeklyDeltaPct !== null && (
        <p className="bee-micro mt-0.5 truncate">{t("trend.delta", { value: weeklyDeltaPct > 0 ? `+${weeklyDeltaPct}` : weeklyDeltaPct })}</p>
      )}
      <div className="mt-auto flex h-6 items-end gap-1" aria-hidden>
        {weeklyBuckets.map((v, i) => (
          <i
            key={i}
            className="flex-1 rounded-sm"
            style={{ height: `${Math.max(15, (v / maxWeekly) * 100)}%`, background: i === weeklyBuckets.length - 1 ? TONE.marketDeep : TONE.market }}
          />
        ))}
      </div>
    </>
  );

  const vigilInner = (
    <>
      <div className="flex items-center justify-between gap-1">
        <Eye className="size-3.5 text-[var(--color-chart-4)]" aria-hidden />
        <span className="bee-micro truncate">{t("vigil.live")}</span>
      </div>
      <p className="bee-micro mt-1.5">{t("vigil.eyebrow")}</p>
      <p className="mt-0.5 line-clamp-2 text-[0.65rem] leading-tight text-[var(--color-text-muted)]">{t("vigil.text")}</p>
    </>
  );

  const windowInner = (
    <>
      <p className="bee-micro truncate">{t("window.eyebrow")}</p>
      <p className="mt-1 text-base font-bold leading-none">{tConf(confidenceKey)}</p>
      <div className="mt-auto flex h-6 items-end gap-1" aria-hidden>
        <i className="flex-1 rounded-sm" style={{ height: "35%", background: SALES.mint }} />
        <i className="flex-1 rounded-sm" style={{ height: "55%", background: SALES.mint }} />
        <i className="flex-1 rounded-sm" style={{ height: "75%", background: SALES.lime }} />
        <i className="flex-1 rounded-sm" style={{ height: "100%", background: SALES.won }} />
      </div>
    </>
  );

  const playInner = (
    <>
      <p className="bee-micro truncate">{t("play.eyebrow")}</p>
      <p className="mt-1 line-clamp-2 text-[0.65rem] leading-tight text-[var(--color-text-muted)]">
        {hotLead ? t("play.chat", { company: hotLead.company_name ?? hotLead.company_domain }) : t("play.text")}
      </p>
      <div className="mt-auto flex gap-1 pt-1.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <i key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < 3 ? TONE.prepared : "color-mix(in srgb, var(--color-text) 14%, transparent)" }} />
        ))}
      </div>
    </>
  );

  const scoreInner = (
    <>
      <p className="bee-micro truncate">{t("score.eyebrow")}</p>
      <div className="mt-1 flex gap-1" aria-hidden>
        {presentTypes.map((type, i) => (
          <i key={type} className="size-2 rounded-full" style={{ background: sourceTones[i] }} />
        ))}
      </div>
      <div className="mt-auto flex items-center gap-1.5 pt-1">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: TONE.marketDeep }}
        >
          {hotLead?.research_intensity_score ?? "—"}
        </span>
        <p className="bee-micro line-clamp-2 leading-tight">{t("score.caption")}</p>
      </div>
    </>
  );

  const pathInner = (
    <>
      <p className="bee-micro truncate">{t("path.eyebrow")}</p>
      <p className="mt-1 line-clamp-2 text-[0.65rem] leading-tight text-[var(--color-text-muted)]">{t("path.text")}</p>
      <div className="mt-auto flex gap-1 pt-1.5" aria-hidden>
        {[TONE.marketDeep, TONE.market, "color-mix(in srgb, " + TONE.market + " 55%, " + SALES.mint + ")", SALES.lime, SALES.won].map((c, i) => (
          <i key={i} className="size-1.5 flex-1 rounded-full" style={{ background: c, maxWidth: 10 }} />
        ))}
      </div>
    </>
  );

  const compareInner = (
    <>
      <p className="bee-micro truncate">{t("compare.eyebrow")}</p>
      <div className="mt-1 flex flex-1 items-end gap-3" aria-hidden>
        <div className="flex flex-1 flex-col items-center gap-0.5">
          <i className="w-full rounded-sm" style={{ height: `${Math.max(15, (baseAvg / maxSalesWon) * 100)}%`, background: "color-mix(in srgb, var(--color-chart-4) 55%, white)" }} />
          <span className="bee-micro">{t("compare.base")}</span>
        </div>
        <div className="flex flex-1 flex-col items-center gap-0.5">
          <i className="w-full rounded-sm" style={{ height: `${Math.max(15, (withSignal / maxSalesWon) * 100)}%`, background: TONE.forecast }} />
          <span className="bee-micro">{t("compare.signal")}</span>
        </div>
      </div>
      <p className="bee-micro mt-1 line-clamp-1">{t("compare.text")}</p>
    </>
  );

  const voiceInner = (
    <>
      <p className="bee-micro truncate">{t("voice.eyebrow")}</p>
      <span
        className="mt-1 inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold"
        style={{ background: "color-mix(in srgb, var(--color-chart-6) 30%, white)" }}
      >
        <i className="size-1 rounded-full" style={{ background: TONE.prepared }} />
        {t("voice.tone")}
      </span>
      <p className="bee-micro mt-auto line-clamp-2 leading-tight">{t("voice.text")}</p>
    </>
  );

  const networkInner = (
    <>
      <p className="bee-micro truncate">{t("network.eyebrow")}</p>
      <p className="bee-micro mt-1 line-clamp-3 leading-tight">{t("network.text")}</p>
    </>
  );

  const learnInner = (
    <>
      <p className="bee-micro truncate">{tDiff("learn.title")}</p>
      <p className="bee-micro mt-1 line-clamp-3 leading-tight">{tDiff("learn.text")}</p>
    </>
  );

  const leadInner = (
    <>
      <p className="bee-micro truncate">{tDiff("lead.title")}</p>
      <p className="bee-micro mt-1 line-clamp-2 leading-tight">{tDiff("lead.text")}</p>
    </>
  );

  return (
    <>
      {/* Phone: no room for a scattered 12-card collage — a plain, narrow
          row of the four most self-explanatory cards. */}
      <div className="mt-8 grid w-full grid-cols-2 gap-2.5 sm:hidden">
        <div className="bee-bento-mini flex flex-col" style={{ height: 118, padding: "0.55rem 0.65rem" }}>{hiveInner}</div>
        <div className="bee-bento-mini flex flex-col" style={{ height: 118, padding: "0.55rem 0.65rem" }}>{playInner}</div>
        <div className="bee-bento-mini flex flex-col" style={{ height: 108, padding: "0.55rem 0.65rem" }}>{windowInner}</div>
        <div className="bee-bento-mini flex flex-col" style={{ height: 108, padding: "0.55rem 0.65rem" }}>{trendInner}</div>
      </div>

      {/* sm+: the full 12-card collage — one bigger centre card (the
          hive, BEE's own mark) with eleven tilted satellites scattered
          around it, corners just touching, matching the reference's
          density instead of a tidy row. */}
      <div className="relative mt-8 hidden w-full max-w-[720px] sm:block lg:mt-10" style={{ height: 336 }}>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 80, left: 255, width: 210, height: 176, padding: "0.7rem 0.85rem", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 20 }}>
          {hiveInner}
        </div>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 16, left: 6, width: 118, height: 82, padding: "0.5rem 0.6rem", transform: "rotate(-7deg)", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 24 }}>
          {trendInner}
        </div>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 0, left: 144, width: 134, height: 88, padding: "0.5rem 0.6rem", transform: "rotate(3deg)", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 18 }}>
          {vigilInner}
        </div>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 2, left: 452, width: 134, height: 88, padding: "0.5rem 0.6rem", transform: "rotate(-4deg)", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 19 }}>
          {scoreInner}
        </div>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 26, left: 592, width: 122, height: 86, padding: "0.5rem 0.6rem", transform: "rotate(5deg)", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 25 }}>
          {playInner}
        </div>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 126, left: 6, width: 112, height: 80, padding: "0.5rem 0.6rem", transform: "rotate(4deg)", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 15 }}>
          {learnInner}
        </div>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 136, left: 592, width: 124, height: 90, padding: "0.5rem 0.6rem", transform: "rotate(-5deg)", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 23 }}>
          {voiceInner}
        </div>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 224, left: 6, width: 118, height: 84, padding: "0.5rem 0.6rem", transform: "rotate(6deg)", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 17 }}>
          {windowInner}
        </div>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 246, left: 140, width: 164, height: 76, padding: "0.5rem 0.6rem", transform: "rotate(-2deg)", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 22 }}>
          {pathInner}
        </div>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 244, left: 452, width: 134, height: 82, padding: "0.5rem 0.6rem", transform: "rotate(4deg)", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 16 }}>
          {compareInner}
        </div>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 222, left: 598, width: 120, height: 88, padding: "0.5rem 0.6rem", transform: "rotate(-3deg)", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 21 }}>
          {networkInner}
        </div>
        <div className="bee-bento-mini absolute flex flex-col" style={{ top: 0, left: 300, width: 142, height: 62, padding: "0.45rem 0.6rem", transform: "rotate(2deg)", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 14 }}>
          {leadInner}
        </div>
        {/* Decorative, matching the hex-icon idiom the old streak card
            used — not a KPI, just the identity mark floating loose. */}
        <svg width="20" height="20" viewBox="-10 -10 20 20" className="absolute" style={{ top: 172, left: 460, opacity: 0.5 }} aria-hidden>
          <path d={hexagonPath(0, 0, 10)} fill={TONE.calm} />
        </svg>
      </div>
    </>
  );
}
