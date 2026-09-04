"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { mix, SALES, TONE } from "@/components/charts/palette";
import { currentMilestoneIndex, milestoneAt } from "@/lib/milestones";

// Honey at the start, a genuine honey→green bridge tone in the middle
// (color-mix between the two, not a tint toward white), the main green as
// the goal at the end — the same sweep however far the real total climbs.
const RAMP = [TONE.marketDeep, TONE.market, mix(TONE.market, 55, SALES.mint), SALES.mint, SALES.lime, SALES.won];

const NODE_R = 20;
const STEP_X = 128;
const Y_TOP = 54;
const Y_BOTTOM = 116;
const VIEW_H = 170;
// Every milestone the team has ever crossed shows — not a truncated tail —
// so the road reads as fully walked, not mostly empty; only two hollow
// ones ahead, enough to say it keeps going without the path looking
// mostly grey.
const AHEAD = 2;

/**
 * The team's real close-milestones (10/20/50/100/200/500…, same sequence
 * `use-milestone-celebration.ts` fires its toast from) as a winding road —
 * no fixed end, since `milestoneAt` never stops generating the next
 * number. Every one already reached is shown, filled solid, honey to
 * green along the whole walked stretch; the road ahead stays hollow and
 * dashed until the team's own total actually gets there. Bare content,
 * no card shell of its own — lives inside WeeklyRecapCard, the week and
 * the all-time road in one window instead of two.
 */
export function MilestonePath({ totalWon }: { totalWon: number }) {
  const t = useTranslations("celebration.path");
  const tooltipFor = (n: { value: number; reached: boolean; isCurrent: boolean }) =>
    n.reached ? t("nodeReached", { value: n.value }) : n.isCurrent ? t("nodeNext", { value: n.value, remaining: n.value - totalWon }) : t("nodeAhead", { value: n.value });

  const { nodes, allPath, reachedPath, viewW, next } = useMemo(() => {
    const curIdx = currentMilestoneIndex(totalWon);
    const startIdx = 0;
    const endIdx = curIdx + AHEAD;
    const list = Array.from({ length: endIdx - startIdx + 1 }, (_, k) => {
      const index = startIdx + k;
      const value = milestoneAt(index);
      return {
        index,
        value,
        reached: value <= totalWon,
        isCurrent: index === curIdx,
        x: 40 + k * STEP_X,
        y: k % 2 === 0 ? Y_TOP : Y_BOTTOM,
      };
    });
    const reachedIndices = list.filter((n) => n.reached).map((n) => n.index);
    const reachedTotal = Math.max(1, reachedIndices.length - 1);
    const colorFor = (n: (typeof list)[number]) => {
      const rampPos = reachedIndices.indexOf(n.index);
      return RAMP[Math.round((rampPos / reachedTotal) * (RAMP.length - 1))];
    };

    let all = "";
    let reachedD = "";
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (i === 0) {
        all = `M${n.x},${n.y}`;
      } else {
        const a = list[i - 1];
        const midX = (a.x + n.x) / 2;
        const seg = ` C${midX},${a.y} ${midX},${n.y} ${n.x},${n.y}`;
        all += seg;
        if (n.reached) {
          if (!reachedD) reachedD = `M${a.x},${a.y}`;
          reachedD += seg;
        }
      }
    }
    return {
      nodes: list.map((n) => ({ ...n, fill: n.reached ? colorFor(n) : null })),
      allPath: all,
      reachedPath: reachedD,
      viewW: 40 + (list.length - 1) * STEP_X + 40,
      next: milestoneAt(curIdx),
    };
  }, [totalWon]);

  return (
    <div>
      <p className="bee-micro">{t("title")}</p>
      <div className="mt-1 overflow-x-auto">
        <svg width={viewW} height={VIEW_H} viewBox={`0 0 ${viewW} ${VIEW_H}`} role="img" aria-label={t("aria", { total: totalWon })} className="mx-auto block">
          <path d={allPath} fill="none" stroke="var(--color-divider)" strokeWidth={4} strokeLinecap="round" strokeDasharray="1 9" />
          {reachedPath && <path d={reachedPath} fill="none" stroke={SALES.won} strokeWidth={4} strokeLinecap="round" />}
          {nodes.map((n) => (
            <g key={n.index} className="cursor-default">
              {/* The next milestone to reach keeps a standing ring — not
                  just the one-time mount pulse, which alone reads too
                  subtle at this size to say "this is the one you're on". */}
              {n.isCurrent && <circle cx={n.x} cy={n.y} r={NODE_R + 9} fill="none" stroke={TONE.urgency} strokeWidth={2} strokeDasharray="2 4" />}
              <circle
                cx={n.x}
                cy={n.y}
                r={n.isCurrent ? NODE_R + 4 : NODE_R}
                fill={n.fill ?? "var(--color-card)"}
                stroke={n.reached ? "var(--color-card)" : "var(--color-border)"}
                strokeWidth={n.reached ? 3 : 2}
                strokeDasharray={n.reached ? undefined : "3 4"}
                className={n.isCurrent ? "bee-hive-pulse-path" : undefined}
              >
                <title>{tooltipFor(n)}</title>
              </circle>
              <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={n.reached ? "#fff" : "var(--color-text-muted)"}>
                {n.value}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="bee-caption mt-1 text-center">{t("progress", { current: totalWon, next })}</p>
    </div>
  );
}
