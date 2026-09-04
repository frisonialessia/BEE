"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { SALES, TONE, tint } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { currentMilestoneIndex, milestoneAt } from "@/lib/milestones";

// Honey at the start of the window, the three Ventas greens by its end —
// the window always sweeps that way, however far the real total climbs.
const RAMP = [TONE.marketDeep, TONE.market, tint(TONE.market, 45), SALES.mint, SALES.lime, SALES.won];

const NODE_R = 20;
const STEP_X = 128;
const Y_TOP = 54;
const Y_BOTTOM = 116;
const VIEW_H = 170;
// A short trail behind the current milestone, then a few ahead — reads as
// a road already walked and one that keeps going, never a fixed finish.
const BEHIND = 3;
const AHEAD = 3;

/**
 * The team's real close-milestones (10/25/50/100…, same sequence
 * `use-milestone-celebration.ts` fires its toast from) as a winding road —
 * no fixed end, since `milestoneAt` never stops generating the next
 * number. Reached nodes fill solid, honey to green along the visible
 * stretch; the road ahead stays hollow and dashed until the team's own
 * total actually gets there.
 */
export function MilestonePathCard({ span = 12, totalWon }: { span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12; totalWon: number }) {
  const t = useTranslations("celebration.path");

  const { nodes, allPath, reachedPath, viewW, next } = useMemo(() => {
    const curIdx = currentMilestoneIndex(totalWon);
    const startIdx = Math.max(0, curIdx - BEHIND);
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
    <OverviewCard span={span} title={t("title")} caption={t("caption")}>
      <div className="overflow-x-auto">
        <svg width={viewW} height={VIEW_H} viewBox={`0 0 ${viewW} ${VIEW_H}`} role="img" aria-label={t("aria", { total: totalWon })} className="mx-auto block">
          <path d={allPath} fill="none" stroke="var(--color-divider)" strokeWidth={4} strokeLinecap="round" strokeDasharray="1 9" />
          {reachedPath && <path d={reachedPath} fill="none" stroke={SALES.won} strokeWidth={4} strokeLinecap="round" />}
          {nodes.map((n) => (
            <g key={n.index}>
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
              />
              <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={n.reached ? "#fff" : "var(--color-text-muted)"}>
                {n.value}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="bee-caption mt-1 text-center">{t("progress", { current: totalWon, next })}</p>
    </OverviewCard>
  );
}
