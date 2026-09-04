"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { mix, SALES, TONE } from "@/components/charts/palette";
import { useBoxSize } from "@/components/charts/use-box-size";
import { milestoneAt } from "@/lib/milestones";

// Honey at the start, a genuine honey→mint bridge tone in the middle
// (color-mix between the two, not a tint toward white), the main green as
// the goal at the end — the same sweep however far the real total climbs.
// No other hue in this component, by design: not even the magenta the
// "current" ring used before — a deeper honey does that job instead.
const RAMP = [TONE.marketDeep, TONE.market, mix(TONE.market, 55, SALES.mint), SALES.mint, SALES.lime, SALES.won];

const NODE_R = 13;
const CY = 22;
const VIEW_H = 44;
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
 */
export function MilestonePath({
  totalWon,
  monthlyGoal = null,
}: {
  totalWon: number;
  /** This rep's wins so far this calendar month vs. their manager-set
   *  monthly target (`Quota.target_count`) — independent of `totalWon`. */
  monthlyGoal?: { current: number; target: number } | null;
}) {
  const t = useTranslations("celebration.path");
  const [hover, setHover] = useState<number | null>(null);
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
      reached: value <= totalWon,
      isCurrent: value === current,
      x: values.length === 1 ? viewW / 2 : pad + (k / span) * (viewW - pad * 2),
    }));

    const rampDenom = Math.max(1, behindShown.length - 1);
    const colorFor = (idx: number) => RAMP[Math.round((idx / rampDenom) * (RAMP.length - 1))];

    let all = "";
    let reachedD = "";
    for (let k = 0; k < list.length; k++) {
      const n = list[k];
      if (k === 0) {
        all = `M${n.x},${CY}`;
      } else {
        all += ` L${n.x},${CY}`;
        if (n.reached) {
          if (!reachedD) reachedD = `M${list[k - 1].x},${CY}`;
          reachedD += ` L${n.x},${CY}`;
        }
      }
    }

    return {
      nodes: list.map((n, k) => ({ ...n, fill: n.reached ? colorFor(k) : null })),
      allPath: all,
      reachedPath: reachedD,
      nextMilestone: current,
    };
  }, [totalWon, viewW]);

  function tooltipFor(n: (typeof nodes)[number]): string {
    if (n.reached) return t("nodeReached", { value: n.value });
    if (n.isCurrent) return t("nodeNext", { value: n.value, remaining: n.value - totalWon });
    return t("nodeAhead", { value: n.value });
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {/* No overflow-x-auto here: at this size the row never needs to
          scroll, and a scroll container would clip the hover tooltip
          positioned above it (setting overflow-x forces overflow-y to
          "auto" too, per the CSS overflow spec). */}
      <div ref={boxRef} className="relative min-w-0 flex-1">
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
                stroke={n.reached ? "var(--color-card)" : "var(--color-border)"}
                strokeWidth={n.reached ? 2.5 : 2}
                strokeDasharray={n.reached ? undefined : "3 3"}
                style={{ transition: "r 120ms ease" }}
              />
              <text x={n.x} y={CY + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={n.reached ? "#fff" : "var(--color-text-muted)"} className="pointer-events-none">
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
