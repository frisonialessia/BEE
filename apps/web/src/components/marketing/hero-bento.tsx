"use client";

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
// `designWidth` is optional: desktop passes only a height (its collage is
// tall-and-narrow enough relative to any real viewport that width was
// never the tighter constraint), but the mobile collage is wide *and*
// short — several of its cards need real width for a sentence to read
// in 2-3 lines instead of clamping — so on a narrow phone the tighter
// constraint is width, not height. Height-only fitting would let a
// design like that render at scale 1 (plenty of vertical room) while
// clipping sideways against `main`; passing designWidth here takes
// whichever of the two ratios is smaller.
function useFitScale(designHeight: number, minScale = 0.55, designWidth?: number) {
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
        const availableH = boundary - el.getBoundingClientRect().top - 10;
        let next = Math.max(minScale, Math.min(1, availableH / designHeight));
        if (designWidth) {
          const availableW = (el.parentElement?.getBoundingClientRect().width ?? window.innerWidth) - 10;
          next = Math.max(minScale, Math.min(next, availableW / designWidth));
        }
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
  }, [designHeight, minScale, designWidth]);

  return { ref, scale };
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
// Same illustrative series as the Ventas comparison's own chart
// (marketing-sales.tsx's WON/TARGET) — same data, so a visitor who opens
// /funcionalidades later sees the identical numbers, not a second
// invented set.
const SALES_WON = [32, 38, 41, 45, 52, 58] as const;
const SALES_TARGET = 50;
// The two collages' hand-placed "design" sizes. useFitScale gets BOTH
// dimensions for each, and uses whichever ratio is tighter — a cluster
// this wide would otherwise render at scale 1 on a narrow screen
// (plenty of vertical room) while clipping sideways against `main`.
//
// The desktop pair is chosen so the cluster renders at scale 1 — no
// shrinking, so the cards read at their real size — on the common
// desktop viewports: 1440×900 leaves it 505×1040 of room and 1366×768
// leaves 392×1040, both above 390×845.
const DESKTOP_DESIGN_H = 415;
const DESKTOP_DESIGN_W = 1200;
const MOBILE_DESIGN_H = 320;
const MOBILE_DESIGN_W = 370;

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

  const hotLead = leads.find((l) => l.id === "h1") ?? leads[0];
  const hiveCells = leads.map((l) => ({ id: l.id, heat: l.research_intensity_score, label: l.company_name ?? l.company_domain }));
  const hiveItems = hiveCells.slice(0, 61);
  const hiveItemsMobile = hiveCells.slice(0, 19);

  const maxSalesWon = Math.max(...SALES_WON, SALES_TARGET);
  // An early-period average as the base, the latest point as "with the
  // signal" — read off the same series, not a second invented pair.
  const baseAvg = Math.round((SALES_WON[0] + SALES_WON[1] + SALES_WON[2]) / 3);
  const withSignal = SALES_WON.at(-1)!;

  // Confidence reads off the actual featured lead's real buying stage —
  // never a hardcoded "Alta" regardless of who's shown.
  const confidenceKey = hotLead?.buying_stage === "ready_to_buy" ? "high" : hotLead?.buying_stage === "decision" ? "medium" : "low";

  // Which signal types are genuinely present today, up to 4 — the score
  // card's source dots reflect real variety, not a fixed decorative count.
  const sourceTones = [TONE.market, TONE.forecast, TONE.prepared, TONE.urgency];
  const presentTypes = Array.from(new Set(signals.map((s) => s.signal_type))).slice(0, 4);

  // Every card below sticks to the landing's four sizes — the H1 (page.tsx),
  // .bee-kpi (24px) for a headline number, text-base (16px) for a headline
  // word, and .bee-micro / text-xs (12px) for every label and line of body.
  // Nothing else: a fifth size on a wall of small cards reads as noise.

  // Desktop hive: a real comb, not a token one. 61 cells (four full rings)
  // at a small radius is what makes it read as dense and finished — the
  // same look the sandbox's Intent hive has, where the count is what does
  // the work, not the cell size.
  const hiveInner = (
    <>
      <div className="flex w-full items-center justify-between gap-2">
        <p className="bee-micro truncate">{t("hive.eyebrow")}</p>
        <span className="flex shrink-0 items-center gap-1.5">
          <i className="size-1.5 animate-pulse rounded-full" style={{ background: TONE.urgency }} aria-hidden />
          <span className="bee-micro">{t("hive.live")}</span>
        </span>
      </div>
      <div className="mt-2 flex w-full flex-1 items-center justify-center">
        <Honeycomb items={hiveItems} maxRadius={18} minHeight={150} ariaLabel={t("hive.aria")} />
      </div>
      <p className="bee-micro mt-2 w-full truncate">{t("hive.caption")}</p>
    </>
  );

  const hiveInnerMobile = (
    <>
      <div className="flex w-full items-center justify-center gap-1.5">
        <i className="size-1.5 shrink-0 animate-pulse rounded-full" style={{ background: TONE.urgency }} aria-hidden />
        <p className="bee-micro truncate">{t("hive.eyebrow")}</p>
      </div>
      <div className="mt-1 flex w-full flex-1 items-center justify-center">
        <Honeycomb items={hiveItemsMobile} maxRadius={12} minHeight={104} ariaLabel={t("hive.aria")} />
      </div>
      <p className="bee-micro mt-1 w-full leading-tight">{t("hive.caption")}</p>
    </>
  );

  // Square: a label, one number, one line of context. Nothing else fits a
  // square this size without crowding, and nothing else needs to.
  const trendInner = (
    <>
      <p className="bee-micro w-full truncate">{t("trend.eyebrow")}</p>
      <p className="bee-kpi mt-auto">{recentSignals}</p>
      <p className="bee-micro mt-1 w-full truncate">{t("trend.caption")}</p>
      <div className="mt-auto flex h-9 w-full items-end gap-1" aria-hidden>
        {weeklyBuckets.map((v, i) => (
          <i
            key={i}
            className="flex-1 rounded-sm"
            style={{ height: `${Math.max(14, (v / maxWeekly) * 100)}%`, background: i === weeklyBuckets.length - 1 ? TONE.marketDeep : TONE.market }}
          />
        ))}
      </div>
    </>
  );

  const windowInner = (
    <>
      <p className="bee-micro w-full truncate">{t("window.eyebrow")}</p>
      <p className="mt-1.5 text-base font-bold leading-tight">{tConf(confidenceKey)}</p>
      <p className="bee-micro mt-1 w-full leading-tight">{t("window.caption")}</p>
      <div className="mt-auto flex h-7 w-full items-end gap-1.5" aria-hidden>
        <i className="flex-1 rounded-sm" style={{ height: "35%", background: SALES.mint }} />
        <i className="flex-1 rounded-sm" style={{ height: "55%", background: SALES.mint }} />
        <i className="flex-1 rounded-sm" style={{ height: "75%", background: SALES.lime }} />
        <i className="flex-1 rounded-sm" style={{ height: "100%", background: SALES.won }} />
      </div>
    </>
  );

  // A miniature of the real assistant rather than a sentence about it:
  // what this card has to land is "the AI is ours", and a chat bubble
  // with BEE's own mark says that before the label is even read.
  const playInner = (
    <>
      <p className="bee-micro w-full truncate">{t("play.eyebrow")}</p>
      <div className="mt-auto flex w-full items-start gap-2 text-left">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--color-chart-1) 32%, var(--color-card))" }}
          aria-hidden
        >
          <svg width="12" height="12" viewBox="-10 -10 20 20">
            <path d={hexagonPath(0, 0, 9)} fill={TONE.marketDeep} />
          </svg>
        </span>
        <span
          className="flex-1 rounded-lg px-2.5 py-2"
          style={{ background: "color-mix(in srgb, var(--color-chart-4) 10%, var(--color-card))" }}
        >
          <span className="block text-xs leading-snug text-[var(--color-text)]">{t("play.text")}</span>
          <span className="mt-1.5 flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <i key={i} className="size-1 animate-pulse rounded-full" style={{ background: TONE.prepared, animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
        </span>
      </div>
      <span className="mt-auto" aria-hidden />
    </>
  );

  const scoreInner = (
    <>
      <p className="bee-micro w-full truncate">{t("score.eyebrow")}</p>
      <span
        className="mt-auto flex size-16 shrink-0 items-center justify-center rounded-full"
        style={{ background: TONE.marketDeep }}
      >
        <span className="bee-kpi" style={{ color: "#fff" }}>
          {hotLead?.research_intensity_score ?? "—"}
        </span>
      </span>
      <div className="mt-2 flex gap-1" aria-hidden>
        {presentTypes.map((type, i) => (
          <i key={type} className="size-2 rounded-full" style={{ background: sourceTones[i] }} />
        ))}
      </div>
      <p className="bee-micro mt-auto w-full leading-tight">{t("score.caption")}</p>
    </>
  );

  // Phone: the same dial one tier smaller. The desktop card gives the
  // score a 64px disc because a square card's whole job is that number;
  // a phone card is 100px tall in total and cannot hold one.
  const scoreInnerMobile = (
    <>
      <p className="bee-micro w-full truncate">{t("score.eyebrow")}</p>
      <span
        className="mt-auto flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold tabular-nums"
        style={{ background: TONE.marketDeep, color: "#fff" }}
      >
        {hotLead?.research_intensity_score ?? "—"}
      </span>
      <div className="mt-1.5 flex gap-1" aria-hidden>
        {presentTypes.map((type, i) => (
          <i key={type} className="size-2 rounded-full" style={{ background: sourceTones[i] }} />
        ))}
      </div>
    </>
  );

  // Square: the tone BEE writes in, then three lines of a drafted message.
  // Skeleton lines, not lorem — the point is the shape of a written reply,
  // and inventing a fake email body would be inventing customer content.
  const voiceInner = (
    <>
      <p className="bee-micro w-full truncate">{t("voice.eyebrow")}</p>
      <span
        className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1"
        style={{ background: "color-mix(in srgb, var(--color-chart-6) 26%, var(--color-card))" }}
      >
        <i className="size-1.5 rounded-full" style={{ background: TONE.prepared }} aria-hidden />
        <span className="bee-micro">{t("voice.tone")}</span>
      </span>
      <span className="mt-auto flex w-full flex-col gap-1.5" aria-hidden>
        {[100, 88, 62].map((w, i) => (
          <i key={i} className="h-1.5 rounded-full" style={{ width: `${w}%`, background: "color-mix(in srgb, var(--color-text) 12%, transparent)" }} />
        ))}
      </span>
      <p className="bee-micro mt-2 w-full leading-tight">{t("voice.text")}</p>
    </>
  );

  // "Aprende de cada cierre" as the curve it describes: the same six-month
  // series Ventas charts, drawn as an area so the shape (it goes up, and
  // keeps going up) is the whole message.
  const LEARN_W = 168;
  const LEARN_H = 44;
  const learnMax = Math.max(...SALES_WON);
  const learnPts = SALES_WON.map((v, i) => {
    const x = (i / (SALES_WON.length - 1)) * LEARN_W;
    const y = LEARN_H - (v / learnMax) * (LEARN_H - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const learnInner = (
    <>
      <p className="bee-micro w-full truncate">{tDiff("learn.title")}</p>
      <p className="bee-micro mt-1 w-full leading-tight">{tDiff("learn.text")}</p>
      <svg width={LEARN_W} height={LEARN_H} viewBox={`0 0 ${LEARN_W} ${LEARN_H}`} className="mt-auto" aria-hidden>
        <polygon points={`0,${LEARN_H} ${learnPts.join(" ")} ${LEARN_W},${LEARN_H}`} fill={SALES.mint} opacity={0.5} />
        <polyline points={learnPts.join(" ")} fill="none" stroke={SALES.won} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={LEARN_W} cy={Number(learnPts.at(-1)!.split(",")[1])} r={3.5} fill={SALES.won} stroke="#fff" strokeWidth={1.5} />
      </svg>
    </>
  );

  // "Tu red ya lo conoce": the warm path drawn as what it is — a couple of
  // hops from someone you already know to the account, not a cold arrow.
  const networkInner = (
    <>
      <p className="bee-micro w-full truncate">{t("network.eyebrow")}</p>
      <p className="bee-micro mt-1 w-full leading-tight">{t("network.text")}</p>
      <svg width="150" height="44" viewBox="0 0 150 44" className="mt-auto" aria-hidden>
        <line x1={16} y1={22} x2={75} y2={12} stroke="var(--color-divider)" strokeWidth={1.5} />
        <line x1={75} y1={12} x2={134} y2={22} stroke={TONE.prepared} strokeWidth={2} />
        <line x1={16} y1={22} x2={75} y2={34} stroke="var(--color-divider)" strokeWidth={1.5} strokeDasharray="2 3" />
        <line x1={75} y1={34} x2={134} y2={22} stroke="var(--color-divider)" strokeWidth={1.5} strokeDasharray="2 3" />
        <circle cx={75} cy={12} r={6} fill={TONE.prepared} stroke="#fff" strokeWidth={1.5} />
        <circle cx={75} cy={34} r={5} fill="var(--color-divider)" stroke="#fff" strokeWidth={1.5} />
        <circle cx={16} cy={22} r={7} fill={TONE.marketDeep} stroke="#fff" strokeWidth={1.5} />
        <path d={hexagonPath(134, 22, 8)} fill={SALES.won} stroke="#fff" strokeWidth={1.5} />
      </svg>
    </>
  );

  // The real MilestonePath (celebration/milestone-path.tsx), miniaturized
  // but not shrunk into illegibility: this card is wide on purpose so the
  // milestones read as a path you walk, which is the whole point of it
  // not being a leaderboard row.
  const PATH_RAMP = [TONE.marketDeep, TONE.market, "color-mix(in srgb, " + TONE.market + " 55%, " + SALES.mint + ")", SALES.mint, SALES.lime, SALES.won];
  const pathValues = [5, 10, 20, 50, 100];
  const pathCurrentIdx = 3;
  const PATH_W = 320;
  const PATH_PAD = 20;
  const pathXs = pathValues.map((_, k) => PATH_PAD + (k / (pathValues.length - 1)) * (PATH_W - PATH_PAD * 2));
  const pathAllD = `M${pathXs[0]},24` + pathXs.slice(1).map((x) => ` L${x},24`).join("");
  const pathReachedD = `M${pathXs[0]},24` + pathXs.slice(1, pathCurrentIdx + 1).map((x) => ` L${x},24`).join("");
  const pathInner = (
    <>
      <p className="bee-micro w-full truncate">{t("path.eyebrow")}</p>
      <p className="bee-micro mt-0.5 w-full truncate">{t("path.text")}</p>
      <svg width={PATH_W} height="48" viewBox={`0 0 ${PATH_W} 48`} className="mt-auto" aria-hidden>
        <path d={pathAllD} fill="none" stroke="var(--color-divider)" strokeWidth={4} strokeLinecap="round" strokeDasharray="1 8" />
        <path d={pathReachedD} fill="none" stroke={SALES.won} strokeWidth={4} strokeLinecap="round" />
        {pathValues.map((v, k) => {
          const reached = k <= pathCurrentIdx;
          const isCurrent = k === pathCurrentIdx;
          const fill = reached ? PATH_RAMP[Math.round((k / (pathValues.length - 2)) * (PATH_RAMP.length - 1))] : "#fff";
          return (
            <g key={v}>
              {isCurrent && <circle cx={pathXs[k]} cy={24} r={17} fill="none" stroke={TONE.marketDeep} strokeWidth={1.5} strokeDasharray="3 4" />}
              <circle cx={pathXs[k]} cy={24} r={isCurrent ? 13 : 11} fill={fill} stroke={reached ? "#fff" : "var(--color-divider)"} strokeWidth={2} strokeDasharray={reached ? undefined : "3 3"} />
              <text x={pathXs[k]} y={28} textAnchor="middle" fontSize={12} fontWeight={700} fill={reached ? "#fff" : "var(--color-text-muted)"}>
                {v}
              </text>
            </g>
          );
        })}
      </svg>
    </>
  );

  // Phone: the same milestones at a size a phone card can actually hold —
  // the desktop path is 320px wide on purpose (the founder asked for it
  // bigger), which simply does not fit a 178px card, and the subtitle
  // needs a full line of its own that there is no room for here.
  const PATH_W_M = 152;
  const pathXsM = pathValues.map((_, k) => 14 + (k / (pathValues.length - 1)) * (PATH_W_M - 28));
  const pathInnerMobile = (
    <>
      <p className="bee-micro w-full truncate">{t("path.eyebrow")}</p>
      <svg width={PATH_W_M} height="36" viewBox={`0 0 ${PATH_W_M} 36`} className="mt-auto" aria-hidden>
        <path d={`M${pathXsM[0]},18` + pathXsM.slice(1).map((x) => ` L${x},18`).join("")} fill="none" stroke="var(--color-divider)" strokeWidth={3} strokeLinecap="round" strokeDasharray="1 6" />
        <path d={`M${pathXsM[0]},18` + pathXsM.slice(1, pathCurrentIdx + 1).map((x) => ` L${x},18`).join("")} fill="none" stroke={SALES.won} strokeWidth={3} strokeLinecap="round" />
        {pathValues.map((v, k) => {
          const reached = k <= pathCurrentIdx;
          const isCurrent = k === pathCurrentIdx;
          const fill = reached ? PATH_RAMP[Math.round((k / (pathValues.length - 2)) * (PATH_RAMP.length - 1))] : "#fff";
          return (
            <g key={v}>
              {isCurrent && <circle cx={pathXsM[k]} cy={18} r={14} fill="none" stroke={TONE.marketDeep} strokeWidth={1.5} strokeDasharray="2 3" />}
              <circle cx={pathXsM[k]} cy={18} r={isCurrent ? 11 : 9.5} fill={fill} stroke={reached ? "#fff" : "var(--color-divider)"} strokeWidth={1.5} strokeDasharray={reached ? undefined : "2 2"} />
              <text x={pathXsM[k]} y={22} textAnchor="middle" fontSize={12} fontWeight={700} fill={reached ? "#fff" : "var(--color-text-muted)"}>
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
      <p className="bee-micro w-full truncate">{t("compare.eyebrow")}</p>
      <p className="bee-micro mt-1 w-full leading-tight">{t("compare.text")}</p>
      <div className="mt-auto flex w-full items-end justify-center gap-4" style={{ height: 56 }} aria-hidden>
        <div className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <i className="w-full rounded-sm" style={{ height: `${Math.max(18, (baseAvg / maxSalesWon) * 100)}%`, background: "color-mix(in srgb, var(--color-chart-4) 40%, white)" }} />
          <span className="bee-micro">{t("compare.base")}</span>
        </div>
        <div className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <i className="w-full rounded-sm" style={{ height: `${Math.max(18, (withSignal / maxSalesWon) * 100)}%`, background: TONE.forecast }} />
          <span className="bee-micro">{t("compare.signal")}</span>
        </div>
      </div>
    </>
  );

  // Phone: the five the founder picked, wide-and-low — a phone leaves
  // ~291px of height but ~358px of width, so the scale is driven by the
  // dimension there is actually room in (see useFitScale).
  const MOBILE_CARDS = [
    { id: "hive", node: hiveInnerMobile, top: 0, left: 0, width: 182, height: 180, rotate: 0, z: 20 },
    { id: "score", node: scoreInnerMobile, top: 0, left: 192, width: 178, height: 100, rotate: 3, z: 23 },
    { id: "play", node: playInner, top: 110, left: 192, width: 178, height: 104, rotate: -2, z: 22 },
    { id: "window", node: windowInner, top: 196, left: 0, width: 182, height: 96, rotate: 4, z: 18 },
    { id: "path", node: pathInnerMobile, top: 232, left: 192, width: 178, height: 88, rotate: 2, z: 17 },
  ] as const;

  // Desktop: a real bento — squares where a card is one number (Señales,
  // el score, la voz), rectangles where it is a small chart, one wide
  // strip for the milestone path, and the comb twice everything else's
  // size at the centre. Designed at 1180×405 so it renders at scale 1 —
  // no shrinking, real sizes — from 1366×768 up.
  const DESKTOP_CARDS = [
    { id: "trend", node: trendInner, top: 0, left: 0, width: 170, height: 170, rotate: -3, z: 24, padding: "0.9rem 1rem" },
    { id: "score", node: scoreInner, top: 8, left: 185, width: 185, height: 170, rotate: 2, z: 23, padding: "0.9rem 1rem" },
    { id: "window", node: windowInner, top: 190, left: 0, width: 170, height: 140, rotate: 3, z: 18, padding: "0.85rem 1rem" },
    { id: "learn", node: learnInner, top: 195, left: 185, width: 200, height: 140, rotate: -2, z: 19, padding: "0.85rem 1rem" },
    { id: "hive", node: hiveInner, top: 30, left: 410, width: 360, height: 255, rotate: 0, z: 20, padding: "1rem 1.15rem" },
    { id: "path", node: pathInner, top: 300, left: 410, width: 360, height: 110, rotate: 0, z: 21, padding: "0.8rem 0.95rem" },
    { id: "play", node: playInner, top: 0, left: 790, width: 200, height: 140, rotate: 3, z: 22, padding: "0.85rem 1rem" },
    { id: "voice", node: voiceInner, top: 10, left: 1005, width: 170, height: 170, rotate: -2, z: 25, padding: "0.9rem 1rem" },
    { id: "compare", node: compareInner, top: 155, left: 790, width: 200, height: 140, rotate: -3, z: 16, padding: "0.85rem 1rem" },
    { id: "network", node: networkInner, top: 195, left: 1005, width: 190, height: 140, rotate: 2, z: 17, padding: "0.85rem 1rem" },
  ] as const;

  return (
    <>
      {/* Phone: the 6 cards that read best at this size, scattered and
          rotated, dragged with a finger like the collage they're a piece
          of — see MobileCollage below for the actual drag mechanics. */}
      <div className="mt-8 flex w-full justify-center sm:hidden">
        <MobileCollage cards={MOBILE_CARDS} />
      </div>

      {/* sm+: the full 12-card collage — one bigger centre card (the
          hive, BEE's own mark) with eleven tilted satellites scattered
          around it, corners just touching, matching the reference's
          density instead of a tidy row. Genuinely draggable, same as the
          phone version below — see DesktopCollage for the mechanics,
          shared with MobileCollage's. */}
      <div className="mt-8 hidden w-full justify-center sm:flex lg:mt-10">
        <DesktopCollage cards={DESKTOP_CARDS} />
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
  // MOBILE_DESIGN_W passed too: this canvas is wider than any phone at
  // its natural size (see MOBILE_DESIGN_H's comment), so on a narrow
  // screen the tighter constraint is width, not height — height-only
  // fitting would render it at scale 1 (there's plenty of vertical
  // room) while it clipped sideways against `main`.
  const { ref: wrapRef, scale } = useFitScale(MOBILE_DESIGN_H, 0.25, MOBILE_DESIGN_W);

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
    // Explicit width: without one this box just fills its full-bleed
    // flex parent (see the caller, which centers via justify-content —
    // not margin:auto, which silently collapses to 0 and drops the
    // centering the moment this box is wider than a narrow phone's
    // available width, e.g. 360px). Since the cards are absolutely
    // placed from left:0, giving the box their real design width is
    // what lets that centering split the slack evenly on both sides.
    // Scaled from top *center*, not top left: even a roomy phone
    // (390×844) shrinks the collage a little (MOBILE_DESIGN_H grew to
    // fit the bigger cards below), and a left origin pulls the whole
    // cluster toward the box's left edge as it shrinks, undoing the
    // centering at anything under scale 1. flexShrink:0 because a flex
    // item shrinks to fit its container by default — letting it do
    // that here would shrink the box's actual width below the design
    // width its absolutely-positioned children still assume, throwing
    // the same centering off again at a narrow phone (320–360px).
    <div ref={wrapRef} style={{ height: MOBILE_DESIGN_H * scale, width: MOBILE_DESIGN_W, flexShrink: 0 }}>
      <div className="relative" style={{ height: MOBILE_DESIGN_H, transform: `scale(${scale})`, transformOrigin: "top center" }}>
        {cards.map((c) => {
          const offset = offsets[c.id] ?? { x: 0, y: 0 };
          const active = activeId === c.id;
          return (
            <div
              key={c.id}
              className="bee-bento-mini absolute flex touch-none flex-col items-center text-center"
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

interface DesktopCard extends MobileCard {
  padding: string;
}

/**
 * Desktop's version of the same drag: identical mechanics to
 * MobileCollage (Pointer Events, per-card offset state, one active card
 * lifted and de-rotated while held) — the user could drag the phone
 * collage but not this one, which was the actual bug, not a design
 * choice. No hint text here either, same as mobile: a scatter of cards
 * that respond to a drag reads as draggable on its own.
 *
 * A much lower floor than the mobile collage's: a wide-but-short window
 * (a landscape phone, 844×390 and 812×375 among the sizes this always
 * gets checked against) leaves this collage far less room relative to
 * its taller 452px design than any real phone leaves the mobile one —
 * and the hero text column's own top margin (see page.tsx) eats further
 * into that room. Pushed down to 0.01 (from an earlier 0.08) once
 * extending it caught 5, then 1, of the 12 cards still clipping the
 * footer at exactly those sizes; "tarjetas más chicas si hace falta" —
 * never clip, even if the collage all but disappears at that one
 * extreme aspect ratio.
 */
function DesktopCollage({ cards }: { cards: readonly DesktopCard[] }) {
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const { ref: wrapRef, scale } = useFitScale(DESKTOP_DESIGN_H, 0.03, DESKTOP_DESIGN_W);

  function handlePointerDown(id: string, e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const base = offsets[id] ?? { x: 0, y: 0 };
    drag.current = { id, startX: e.clientX, startY: e.clientY, baseX: base.x, baseY: base.y };
    setActiveId(id);
  }
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
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
    // Explicit width + flexShrink:0 + a top-center origin, same as
    // MobileCollage: the cards are absolutely placed from left:0, so
    // without a real width to center the box would sit flush left, and
    // a top-LEFT scale origin would pull the cluster leftwards again
    // every time it shrinks.
    <div ref={wrapRef} style={{ height: DESKTOP_DESIGN_H * scale, width: DESKTOP_DESIGN_W, flexShrink: 0 }}>
      <div className="relative" style={{ height: DESKTOP_DESIGN_H, transform: `scale(${scale})`, transformOrigin: "top center" }}>
        {cards.map((c) => {
          const offset = offsets[c.id] ?? { x: 0, y: 0 };
          const active = activeId === c.id;
          return (
            <div
              key={c.id}
              className="bee-bento-mini absolute flex touch-none flex-col items-center text-center"
              style={{
                top: c.top,
                left: c.left,
                width: c.width,
                height: c.height,
                padding: c.padding,
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
        {/* Decorative, matching the hex-icon idiom the old streak card
            used — not a KPI and not draggable, just the identity mark
            floating loose. */}
        <svg width="20" height="20" viewBox="-10 -10 20 20" className="absolute" style={{ top: 172, left: 598, opacity: 0.5 }} aria-hidden>
          <path d={hexagonPath(0, 0, 10)} fill={TONE.calm} />
        </svg>
      </div>
    </div>
  );
}
