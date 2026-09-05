"use client";

import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { Honeycomb } from "@/components/charts/honeycomb";
import { SALES, TONE } from "@/components/charts/palette";
import { hexagonPath } from "@/lib/visualization/honeycomb-radial";
import type { Locale } from "@/i18n/locales";
import { getSampleHotLeads, getSampleSignals } from "@/lib/sample-data";

/**
 * Fit a fixed-design-size collage into whatever room is actually left
 * above the footer — the page is cero-scroll (see app/page.tsx), so on a
 * short window `main`'s own overflow-hidden would otherwise silently
 * clip the collage's last row instead of the page scrolling for it (this
 * shipped without it once already, caught by measuring, not by eye, at
 * both a short desktop window and a short phone). Same "measure the real
 * box, don't assume a fixed one" rule use-box-size.ts already applies to
 * every chart — here for a plain DOM scatter instead of an SVG, and
 * scaling the whole collage (not reflowing it) since it was hand-placed
 * at one fixed size.
 *
 * Iterates: `main` centers its whole column (justify-center), so
 * shrinking the collage moves *where* it sits, which invalidates a
 * measurement taken before that move. A few passes of measure→resize
 * (mutating the DOM directly so each pass sees the last one's real,
 * reflowed layout, not stale React state) converge in practice within
 * 2-3 steps; committed to state once settled.
 */
function useFitScale(designHeight: number, minScale = 0.55) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function fit() {
      const el = ref.current;
      const inner = el?.firstElementChild as HTMLElement | null;
      if (!el || !inner) return;
      let s = 1;
      for (let i = 0; i < 5; i++) {
        const boundary = el.closest("main")?.getBoundingClientRect().bottom ?? window.innerHeight;
        const available = boundary - el.getBoundingClientRect().top - 10;
        const next = Math.max(minScale, Math.min(1, available / designHeight));
        if (Math.abs(next - s) < 0.005 && i > 0) {
          s = next;
          break;
        }
        s = next;
        el.style.height = `${designHeight * s}px`;
        inner.style.transform = `scale(${s})`;
      }
      setScale(s);
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [designHeight, minScale]);

  return { ref, scale };
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
// The two collages' hand-placed "design" sizes — see useFitScale, which
// scales each down to whatever room is actually available.
const DESKTOP_DESIGN_H = 452;
const MOBILE_DESIGN_H = 252;
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
  // A lower floor than the mobile collage's default: a wide-but-short
  // window (a landscape phone, 844×390 among the sizes this always gets
  // checked against) leaves the desktop collage far less room relative
  // to its taller 452px design than any real phone leaves the mobile
  // one — this shipped with the shared default once and 5 of the 12
  // cards clipped against the footer at exactly that size.
  const { ref: desktopRef, scale: desktopScale } = useFitScale(DESKTOP_DESIGN_H, 0.08);

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

  // Same idea, smaller floor — the phone card gives the hive 130px total,
  // not the desktop card's 176px, and Honeycomb's own `minHeight` is a
  // hard floor it won't shrink under; without a smaller one here the
  // card measurably overflowed its own box (caught by measuring
  // scrollHeight vs clientHeight before this shipped, not by eye).
  const hiveInnerMobile = (
    <>
      <div className="flex items-center justify-between gap-1">
        <p className="bee-micro truncate">{t("hive.eyebrow")}</p>
        <span className="flex shrink-0 items-center gap-1">
          <i className="size-1.5 animate-pulse rounded-full" style={{ background: TONE.urgency }} aria-hidden />
          <span className="bee-micro">{t("hive.live")}</span>
        </span>
      </div>
      <div className="mt-1 flex flex-1 items-center justify-center">
        <Honeycomb items={hiveItems} maxRadius={9} minHeight={80} ariaLabel={t("hive.aria")} />
      </div>
      {hotLead && <p className="mt-0.5 truncate text-center text-xs font-semibold">{hotLead.company_name ?? hotLead.company_domain}</p>}
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

  // The real MilestonePath (celebration/milestone-path.tsx), miniaturized:
  // dashed grey base, the honey→green ramp on the reached segment, numbered
  // nodes, a dashed ring on the "current" one — the same illustrative
  // 5/10/20/50/100 sweep this card always showed, just drawn as the actual
  // component's own visual language instead of a plain row of dots.
  const PATH_RAMP = [TONE.marketDeep, TONE.market, "color-mix(in srgb, " + TONE.market + " 55%, " + SALES.mint + ")", SALES.mint, SALES.lime, SALES.won];
  const pathValues = [5, 10, 20, 50, 100];
  const pathCurrentIdx = 3;
  const PATH_W = 166;
  const PATH_PAD = 12;
  const pathXs = pathValues.map((_, k) => PATH_PAD + (k / (pathValues.length - 1)) * (PATH_W - PATH_PAD * 2));
  const pathAllD = `M${pathXs[0]},18` + pathXs.slice(1).map((x) => ` L${x},18`).join("");
  const pathReachedD = `M${pathXs[0]},18` + pathXs.slice(1, pathCurrentIdx + 1).map((x) => ` L${x},18`).join("");
  const pathInner = (
    <>
      <p className="bee-micro truncate">{t("path.eyebrow")}</p>
      <p className="mt-1 line-clamp-1 text-[0.65rem] leading-tight text-[var(--color-text-muted)]">{t("path.text")}</p>
      <svg width={PATH_W} height="36" viewBox={`0 0 ${PATH_W} 36`} className="mt-auto" aria-hidden>
        <path d={pathAllD} fill="none" stroke="var(--color-divider)" strokeWidth={3} strokeLinecap="round" strokeDasharray="1 6" />
        <path d={pathReachedD} fill="none" stroke={SALES.won} strokeWidth={3} strokeLinecap="round" />
        {pathValues.map((v, k) => {
          const reached = k <= pathCurrentIdx;
          const isCurrent = k === pathCurrentIdx;
          const fill = reached ? PATH_RAMP[Math.round((k / (pathValues.length - 2)) * (PATH_RAMP.length - 1))] : "#fff";
          return (
            <g key={v}>
              {isCurrent && <circle cx={pathXs[k]} cy={18} r={12.5} fill="none" stroke={TONE.marketDeep} strokeWidth={1.5} strokeDasharray="2 3" />}
              <circle cx={pathXs[k]} cy={18} r={isCurrent ? 9.5 : 8} fill={fill} stroke={reached ? "#fff" : "var(--color-divider)"} strokeWidth={1.5} strokeDasharray={reached ? undefined : "2 2"} />
              <text x={pathXs[k]} y={20.5} textAnchor="middle" fontSize={7} fontWeight={700} fill={reached ? "#fff" : "var(--color-text-muted)"}>
                {v}
              </text>
            </g>
          );
        })}
      </svg>
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

  // Direct CRM comparison — a dash for the CRM row, a filled check for
  // BEE's, both sourced from the same real contrast Ventas already makes
  // ("Los CRM registran ventas. BEE las cierra."), just split into four
  // short rows instead of one paragraph so it reads at a glance this small.
  const crmInner = (
    <>
      <p className="bee-micro truncate">{t("crm.eyebrow")}</p>
      <div className="mt-1 flex flex-col justify-center gap-1">
        {(
          [
            [t("crm.crmRow1"), false],
            [t("crm.beeRow1"), true],
            [t("crm.crmRow2"), false],
            [t("crm.beeRow2"), true],
          ] as const
        ).map(([label, isBee], i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="flex size-3.5 shrink-0 items-center justify-center rounded-full"
              style={{ background: isBee ? TONE.marketDeep : "var(--color-divider)" }}
              aria-hidden
            >
              {isBee && (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.5}>
                  <path d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            <span className="bee-micro truncate">{label}</span>
          </div>
        ))}
      </div>
    </>
  );

  // Phone: the same idea as the desktop collage — scattered, tilted,
  // never a flat grid — sized for the narrowest real target (~320px) so
  // a wider phone just gets extra margin on the right, never overflow.
  // Genuinely draggable (pointer events, real offset state): a card that
  // starts nudged behind a neighbour is one drag away from sitting in
  // the clear, so the tight mobile fit never permanently hides one.
  const MOBILE_CARDS = [
    { id: "hive", node: hiveInnerMobile, top: 42, left: 90, width: 140, height: 130, rotate: 0, z: 20 },
    { id: "trend", node: trendInner, top: 0, left: 0, width: 88, height: 64, rotate: -6, z: 22 },
    { id: "play", node: playInner, top: 6, left: 234, width: 80, height: 72, rotate: 5, z: 23 },
    { id: "window", node: windowInner, top: 176, left: 0, width: 88, height: 64, rotate: 6, z: 18 },
    { id: "learn", node: learnInner, top: 182, left: 228, width: 86, height: 62, rotate: -4, z: 19 },
    { id: "vigil", node: vigilInner, top: 182, left: 90, width: 138, height: 56, rotate: 2, z: 17 },
  ] as const;

  return (
    <>
      {/* Phone: the 6 cards that read best at this size, scattered and
          rotated, dragged with a finger like the collage they're a piece
          of — see MobileCollage below for the actual drag mechanics. */}
      <div className="mt-8 w-full sm:hidden">
        <MobileCollage cards={MOBILE_CARDS} />
      </div>

      {/* sm+: the full 12-card collage — one bigger centre card (the
          hive, BEE's own mark) with eleven tilted satellites scattered
          around it, corners just touching, matching the reference's
          density instead of a tidy row. Wrapped in the same measured
          scale-to-fit as the mobile collage (see useFitScale): a short
          window (a laptop with the browser chrome eating into it, or a
          landscape phone) needs this exactly as much as a short phone
          does — caught the same way, by measuring, after this shipped
          without it once and a short window clipped the last row
          against the footer. */}
      <div ref={desktopRef} className="relative mt-8 hidden w-full max-w-[720px] sm:block lg:mt-10" style={{ height: DESKTOP_DESIGN_H * desktopScale }}>
        <div className="relative" style={{ height: DESKTOP_DESIGN_H, transform: `scale(${desktopScale})`, transformOrigin: "top left" }}>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 80, left: 255, width: 210, height: 176, padding: "0.7rem 0.85rem", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 20 }}>
            {hiveInner}
          </div>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 16, left: 6, width: 118, height: 82, padding: "0.5rem 0.6rem", transform: "rotate(-7deg)", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 24 }}>
            {trendInner}
          </div>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 0, left: 144, width: 134, height: 88, padding: "0.5rem 0.6rem", transform: "rotate(3deg)", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 18 }}>
            {vigilInner}
          </div>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 2, left: 452, width: 134, height: 88, padding: "0.5rem 0.6rem", transform: "rotate(-4deg)", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 19 }}>
            {scoreInner}
          </div>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 26, left: 592, width: 122, height: 86, padding: "0.5rem 0.6rem", transform: "rotate(5deg)", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 25 }}>
            {playInner}
          </div>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 126, left: 6, width: 112, height: 80, padding: "0.5rem 0.6rem", transform: "rotate(4deg)", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 15 }}>
            {learnInner}
          </div>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 136, left: 592, width: 124, height: 90, padding: "0.5rem 0.6rem", transform: "rotate(-5deg)", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 23 }}>
            {voiceInner}
          </div>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 224, left: 6, width: 118, height: 84, padding: "0.5rem 0.6rem", transform: "rotate(6deg)", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 17 }}>
            {windowInner}
          </div>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 246, left: 140, width: 190, height: 90, padding: "0.5rem 0.6rem", transform: "rotate(-2deg)", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 22 }}>
            {pathInner}
          </div>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 244, left: 452, width: 134, height: 82, padding: "0.5rem 0.6rem", transform: "rotate(4deg)", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 16 }}>
            {compareInner}
          </div>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 222, left: 598, width: 120, height: 88, padding: "0.5rem 0.6rem", transform: "rotate(-3deg)", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 21 }}>
            {networkInner}
          </div>
          <div className="bee-bento-mini absolute flex flex-col" style={{ top: 336, left: 214, width: 284, height: 112, padding: "0.55rem 0.7rem", transform: "rotate(-1.5deg)", overflow: "hidden", boxShadow: "var(--bee-shadow-card-lift)", zIndex: 14 }}>
            {crmInner}
          </div>
          {/* Decorative, matching the hex-icon idiom the old streak card
              used — not a KPI, just the identity mark floating loose. */}
          <svg width="20" height="20" viewBox="-10 -10 20 20" className="absolute" style={{ top: 172, left: 460, opacity: 0.5 }} aria-hidden>
            <path d={hexagonPath(0, 0, 10)} fill={TONE.calm} />
          </svg>
        </div>
      </div>
    </>
  );
}

interface MobileCard {
  id: string;
  node: ReactNode;
  top: number;
  left: number;
  width: number;
  height: number;
  rotate: number;
  z: number;
}

/**
 * The phone version of the collage's drag: real pointer-event state, not
 * a decorative transform. One card at a time (`activeId`) lifts to the
 * top and drops its rotation while held, exactly the feel the desktop
 * mockups this shipped from were judged by — Pointer Events cover mouse,
 * touch and pen with the same handlers, so this needs no separate touch
 * path. No drop-zone or boundary clamp: a phone-sized collage has no
 * "wrong place" to drop a card, it is just rearranged for reading.
 */

function MobileCollage({ cards }: { cards: readonly MobileCard[] }) {
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const { ref: wrapRef, scale } = useFitScale(MOBILE_DESIGN_H);

  function handlePointerDown(id: string, e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const base = offsets[id] ?? { x: 0, y: 0 };
    drag.current = { id, startX: e.clientX, startY: e.clientY, baseX: base.x, baseY: base.y };
    setActiveId(id);
  }
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    // Divide by scale: the outer wrapper's own transform:scale() means a
    // screen pixel of finger movement is only `scale` design-pixels
    // here, so without this a shrunk (short-phone) collage would drag
    // faster than the finger moves.
    setOffsets((prev) => ({
      ...prev,
      [d.id]: { x: d.baseX + (e.clientX - d.startX) / scale, y: d.baseY + (e.clientY - d.startY) / scale },
    }));
  }
  function handlePointerUp() {
    drag.current = null;
    setActiveId(null);
  }

  return (
    <div ref={wrapRef} style={{ height: MOBILE_DESIGN_H * scale }}>
      <div className="relative" style={{ height: MOBILE_DESIGN_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {cards.map((c) => {
          const offset = offsets[c.id] ?? { x: 0, y: 0 };
          const active = activeId === c.id;
          return (
            <div
              key={c.id}
              className="bee-bento-mini absolute flex touch-none flex-col"
              style={{
                top: c.top,
                left: c.left,
                width: c.width,
                height: c.height,
                padding: "0.45rem 0.55rem",
                overflow: "hidden",
                boxShadow: "var(--bee-shadow-card-lift)",
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${active ? 0 : c.rotate}deg)`,
                transition: active ? "none" : "transform 180ms ease",
                zIndex: active ? 60 : c.z,
                cursor: active ? "grabbing" : "grab",
              }}
              onPointerDown={(e) => handlePointerDown(c.id, e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {c.node}
            </div>
          );
        })}
      </div>
    </div>
  );
}
