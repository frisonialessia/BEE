"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";

import { mix, SALES, TONE } from "@/components/charts/palette";
import { useBoxSize } from "@/components/charts/use-box-size";
import { milestoneAt } from "@/lib/milestones";
import { hexagonPath } from "@/lib/visualization/honeycomb-radial";

// Honey at the start, a genuine honey→mint bridge tone in the middle
// (color-mix between the two, not a tint toward white), the main green as
// the goal at the end — the same sweep however far the real total climbs.
// No other hue in this component, by design: not even the magenta the
// "current" ring used before — a deeper honey does that job instead.
const RAMP = [TONE.marketDeep, TONE.market, mix(TONE.market, 55, SALES.mint), SALES.mint, SALES.lime, SALES.won];

const NODE_R = 13;
const CY = 22;
const VIEW_H = 44;
const BADGE_R = 12;

/** This week's real, per-rep activity — a hexagon (honey, matching the
 *  hive) when the rep added a lead, a distinct badge for an organization,
 *  another for an unusually active meeting week. Each only renders when
 *  it actually happened; a rep with a quiet week just gets a shorter
 *  prelude, never a fabricated badge. */
type WeeklyEvents = {
  leadsAdded: number;
  companiesAdded: number;
  activeMeetingsWeek: boolean;
};
type EventKey = "leads" | "companies" | "meetings";
// Just enough reached milestones to show the sweep, plus a couple ahead
// to say it keeps going — this row is meant to stay narrow, not walk the
// rep's entire history.
const BEHIND = 3;
const AHEAD = 2;

/**
 * A rep's own lifetime close-milestones (10/20/50/100…, same sequence
 * `use-milestone-celebration.ts` fires its toast from) as a slim inline
 * road — one row, no card of its own, meant to sit inside
 * WeeklyRecapCard's single compact line. The road itself always reads
 * the lifetime sequence, never distorted by a period goal — a manager's
 * monthly target (see quotas-section.tsx) and a lifetime round number
 * are different axes, and splicing one into the other as if they were
 * the same "next milestone" was a real bug caught before this shipped.
 * Instead, when a monthly goal is active, the fraction on the right
 * switches to it (this month's progress toward it) while the path keeps
 * showing the honest lifetime sweep. Hover (not a native `title`, which
 * can't be styled) shows what each node means.
 *
 * A short prelude of up to three event badges can sit before the numeric
 * spine — this week's real actions (a lead added, an organization added,
 * an active meeting week), each its own shape and BEE tone so the road
 * reads like a real timeline of what the rep actually did, not just a
 * close counter. They share this same row (and so the same measured
 * width — see useBoxSize below), never grow the card.
 */
export function MilestonePath({
  totalWon,
  monthlyGoal = null,
  weeklyEvents,
}: {
  totalWon: number;
  /** This rep's wins so far this calendar month vs. their manager-set
   *  monthly target (`Quota.target_count`) — independent of `totalWon`. */
  monthlyGoal?: { current: number; target: number } | null;
  weeklyEvents?: WeeklyEvents;
}) {
  const t = useTranslations("celebration.path");
  const [hover, setHover] = useState<number | null>(null);
  const [eventHover, setEventHover] = useState<EventKey | null>(null);
  const gradId = useId();
  // Same rule every chart in BEE follows (see use-box-size.ts): the chart
  // fills the box it's actually given, it doesn't pick its own width and
  // leave the rest of the row empty. Node spacing is derived from the
  // measured width below, not a fixed step.
  const [boxRef, { width: viewW }] = useBoxSize<HTMLDivElement>({ width: 260, height: VIEW_H });

  const { nodes, allPath, reachedPath, nextMilestone } = useMemo(() => {
    const behind: number[] = [];
    let i = 0;
    while (milestoneAt(i) < totalWon) {
      behind.push(milestoneAt(i));
      i++;
    }
    // Only the last few reached milestones show — this row stays narrow
    // by design (no horizontal scroll: a scroll container would clip the
    // hover tooltip), so a veteran rep's full history would otherwise
    // overflow it. The sweep still reads honey→green across whatever is
    // visible, just over a shorter, bounded stretch.
    const behindShown = behind.slice(-BEHIND);
    const current = milestoneAt(i);

    const ahead: number[] = [];
    let j = i + 1;
    while (ahead.length < AHEAD) {
      ahead.push(milestoneAt(j));
      j++;
    }

    const values = [...behindShown, current, ...ahead];
    const pad = NODE_R + 5;
    const span = Math.max(1, values.length - 1);
    const list = values.map((value, k) => ({
      value,
      // Honest — drives the hover tooltip's wording, never the styling.
      reached: value <= totalWon,
      isCurrent: value === current,
      // Styling only: every node colors in except the very last one,
      // regardless of totalWon — a rep who just started (a handful of
      // real closes) still gets a road that reads as "underway", not one
      // where 4 of 6 dots sit flat grey because the honest count is
      // still low. The dashed "you are here" ring on isCurrent still
      // marks the real next target either way.
      colored: k < values.length - 1,
      x: values.length === 1 ? viewW / 2 : pad + (k / span) * (viewW - pad * 2),
    }));

    const rampDenom = Math.max(1, list.length - 2);
    const colorFor = (idx: number) => RAMP[Math.round((idx / rampDenom) * (RAMP.length - 1))];

    let all = "";
    let coloredD = "";
    for (let k = 0; k < list.length; k++) {
      const n = list[k];
      if (k === 0) {
        all = `M${n.x},${CY}`;
      } else {
        all += ` L${n.x},${CY}`;
        if (n.colored) {
          if (!coloredD) coloredD = `M${list[k - 1].x},${CY}`;
          coloredD += ` L${n.x},${CY}`;
        }
      }
    }

    return {
      nodes: list.map((n, k) => ({ ...n, fill: n.colored ? colorFor(k) : null })),
      allPath: all,
      reachedPath: coloredD,
      nextMilestone: current,
    };
  }, [totalWon, viewW]);

  function tooltipFor(n: (typeof nodes)[number]): string {
    if (n.reached) return t("nodeReached", { value: n.value });
    if (n.isCurrent) return t("nodeNext", { value: n.value, remaining: n.value - totalWon });
    return t("nodeAhead", { value: n.value });
  }

  return (
    // Full width (its own wrapped row, under WeeklyRecapCard's flex-wrap)
    // below sm, back to sharing the row as flex-1 at sm and up — `min-w-0`
    // together with `flex-1` alone let this shrink toward zero instead of
    // ever wrapping (nothing forced a line break, since min-w-0 removes
    // the min-content floor flex-wrap would otherwise trip on), so on a
    // phone the whole path just vanished instead of dropping to its own
    // line. `flex-wrap` here too: on a narrow phone even this own line is
    // too tight for badges + the numeric road + the goal fraction side by
    // side — better a short second line (badges on top, road + fraction
    // below, still one compact block) than all three crushed unreadable
    // into one. Same footprint either way — one or two more compact rows,
    // never a taller card.
    <div className="flex w-full min-w-0 flex-wrap items-center gap-3 sm:w-auto sm:flex-1">
      {weeklyEvents && (weeklyEvents.leadsAdded > 0 || weeklyEvents.companiesAdded > 0 || weeklyEvents.activeMeetingsWeek) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {weeklyEvents.leadsAdded > 0 && (
            <div className="relative">
              <svg width={BADGE_R * 2 + 2} height={BADGE_R * 2 + 2} viewBox={`0 0 ${BADGE_R * 2 + 2} ${BADGE_R * 2 + 2}`} role="img" aria-label={t("eventLeads", { count: weeklyEvents.leadsAdded })}>
                <defs>
                  <linearGradient id={`${gradId}-lead`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={TONE.market} />
                    <stop offset="100%" stopColor={TONE.marketDeep} />
                  </linearGradient>
                </defs>
                <g
                  className="cursor-pointer"
                  onMouseEnter={() => setEventHover("leads")}
                  onMouseLeave={() => setEventHover((h) => (h === "leads" ? null : h))}
                >
                  <circle cx={BADGE_R + 1} cy={BADGE_R + 1} r={BADGE_R} fill={`url(#${gradId}-lead)`} />
                  <path d={hexagonPath(BADGE_R + 1, BADGE_R + 1, 7)} fill="#fff" />
                </g>
              </svg>
              {eventHover === "leads" && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-card)]">
                  {t("eventLeads", { count: weeklyEvents.leadsAdded })}
                </div>
              )}
            </div>
          )}
          {weeklyEvents.companiesAdded > 0 && (
            <div className="relative">
              <svg width={BADGE_R * 2 + 2} height={BADGE_R * 2 + 2} viewBox={`0 0 ${BADGE_R * 2 + 2} ${BADGE_R * 2 + 2}`} role="img" aria-label={t("eventCompanies", { count: weeklyEvents.companiesAdded })}>
                <g
                  className="cursor-pointer"
                  onMouseEnter={() => setEventHover("companies")}
                  onMouseLeave={() => setEventHover((h) => (h === "companies" ? null : h))}
                >
                  <circle cx={BADGE_R + 1} cy={BADGE_R + 1} r={BADGE_R} fill={TONE.prepared} />
                  <rect x={BADGE_R + 1 - 6} y={BADGE_R + 1 - 6} width={12} height={12} rx={2.5} fill="#fff" />
                </g>
              </svg>
              {eventHover === "companies" && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-card)]">
                  {t("eventCompanies", { count: weeklyEvents.companiesAdded })}
                </div>
              )}
            </div>
          )}
          {weeklyEvents.activeMeetingsWeek && (
            <div className="relative">
              <svg width={BADGE_R * 2 + 2} height={BADGE_R * 2 + 2} viewBox={`0 0 ${BADGE_R * 2 + 2} ${BADGE_R * 2 + 2}`} role="img" aria-label={t("eventMeetings")}>
                <g
                  className="cursor-pointer"
                  onMouseEnter={() => setEventHover("meetings")}
                  onMouseLeave={() => setEventHover((h) => (h === "meetings" ? null : h))}
                >
                  <circle cx={BADGE_R + 1} cy={BADGE_R + 1} r={BADGE_R} fill={TONE.forecast} />
                  <circle cx={BADGE_R + 1} cy={BADGE_R + 1} r={5} fill="none" stroke="#fff" strokeWidth={2} />
                </g>
              </svg>
              {eventHover === "meetings" && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-card)]">
                  {t("eventMeetings")}
                </div>
              )}
            </div>
          )}
          <div className="h-6 w-px shrink-0 bg-[var(--color-divider)]" />
        </div>
      )}
      {/* No overflow-x-auto here: at this size the row never needs to
          scroll, and a scroll container would clip the hover tooltip
          positioned above it (setting overflow-x forces overflow-y to
          "auto" too, per the CSS overflow spec). */}
      {/* min-w-[10rem], not min-w-0: this is what actually forces a wrap
          onto its own line on a narrow phone — min-w-0 has no floor, so
          flex-wrap never saw a reason to break the line and this whole
          box just kept shrinking past legibility instead. */}
      <div ref={boxRef} className="relative min-w-[10rem] flex-1">
        <svg width={viewW} height={VIEW_H} viewBox={`0 0 ${viewW} ${VIEW_H}`} role="img" aria-label={t("aria", { total: totalWon })} className="block">
          <path d={allPath} fill="none" stroke="var(--color-divider)" strokeWidth={3} strokeLinecap="round" strokeDasharray="1 7" />
          {reachedPath && <path d={reachedPath} fill="none" stroke={SALES.won} strokeWidth={3} strokeLinecap="round" />}
          {nodes.map((n, i) => (
            <g
              key={i}
              className="cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            >
              {n.isCurrent && <circle cx={n.x} cy={CY} r={NODE_R + 5} fill="none" stroke={TONE.marketDeep} strokeWidth={2} strokeDasharray="2 3" />}
              <circle
                cx={n.x}
                cy={CY}
                r={hover === i ? NODE_R + 3 : n.isCurrent ? NODE_R + 2 : NODE_R}
                fill={n.fill ?? "var(--color-card)"}
                stroke={n.colored ? "var(--color-card)" : "var(--color-border)"}
                strokeWidth={n.colored ? 2.5 : 2}
                strokeDasharray={n.colored ? undefined : "3 3"}
                style={{ transition: "r 120ms ease" }}
              />
              <text x={n.x} y={CY + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={n.colored ? "#fff" : "var(--color-text-muted)"} className="pointer-events-none">
                {n.value}
              </text>
            </g>
          ))}
        </svg>
        {hover !== null && nodes[hover] && (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-card)]"
            style={{ left: nodes[hover].x }}
          >
            {tooltipFor(nodes[hover])}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        {monthlyGoal ? (
          <>
            <p className="text-sm font-bold tabular-nums leading-tight">{t("goalFraction", { current: monthlyGoal.current, next: monthlyGoal.target })}</p>
            <p className="bee-micro">{t("goalLabel")}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold tabular-nums leading-tight">{t("goalFraction", { current: totalWon, next: nextMilestone })}</p>
            <p className="bee-micro">{t("nextMilestoneLabel")}</p>
          </>
        )}
      </div>
    </div>
  );
}
