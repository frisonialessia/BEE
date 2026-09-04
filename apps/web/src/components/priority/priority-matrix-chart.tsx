"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { REST, TONE, mix, tint } from "@/components/charts/palette";
import { useBoxSize } from "@/components/charts/use-box-size";
import type { CompanyPriority } from "@/lib/icp";
import { useDashboardBase } from "@/lib/demo/mode";

type Quadrant = CompanyPriority["quadrant"];

/** One hue — magenta, the urgency tone — at three intensities: the
 *  quadrant to work first at 100 %, nurture / opportunistic at 70 / 45 %,
 *  and the accounts to deprioritize in the page grey. Exported so the
 *  legend beside the chart never drifts from the dots. */
export const QUADRANT_COLOR: Record<Quadrant, string> = {
  priority: TONE.urgency,
  nurture: tint(TONE.urgency, 70),
  opportunistic: tint(TONE.urgency, 45),
  deprioritize: REST,
};

const PAD_LEFT = 34;
const PAD_BOTTOM = 30;
const PAD_TOP = 10;
const PAD_RIGHT = 12;

/**
 * Fit × intención — every company is a dot. Fills its box (use-box-size);
 * the four quadrants carry their name inside the plot, in ink, so "Prioridad
 * máxima" is read where it is drawn. Clicking a quadrant selects it (the
 * list beside the chart follows); clicking a dot opens the company.
 */
export function PriorityMatrixChart({
  priorities,
  minHeight = 240,
  selected = null,
  onSelectQuadrant,
}: {
  priorities: CompanyPriority[];
  minHeight?: number;
  selected?: Quadrant | null;
  onSelectQuadrant?: (quadrant: Quadrant) => void;
}) {
  const router = useRouter();
  const base = useDashboardBase();
  const t = useTranslations("sharedB.priorityMatrix");
  const tQ = useTranslations("opportunitiesPriority.priority.quadrants");
  const [ref, { width: W, height: H }] = useBoxSize<HTMLDivElement>({ width: 560, height: minHeight });
  const [hover, setHover] = useState<string | null>(null);

  const plotW = Math.max(1, W - PAD_LEFT - PAD_RIGHT);
  const plotH = Math.max(1, H - PAD_TOP - PAD_BOTTOM);
  const toX = (fit: number) => PAD_LEFT + (fit / 100) * plotW;
  const toY = (intent: number) => PAD_TOP + ((100 - intent) / 100) * plotH;
  const midX = toX(50);
  const midY = toY(50);
  const right = W - PAD_RIGHT;
  const bottom = H - PAD_BOTTOM;

  const quadrants: { key: Quadrant; x: number; y: number; w: number; h: number; lx: number; ly: number; anchor: "start" | "end"; baseline: "hanging" | "auto" }[] = [
    { key: "opportunistic", x: PAD_LEFT, y: PAD_TOP, w: midX - PAD_LEFT, h: midY - PAD_TOP, lx: PAD_LEFT + 8, ly: PAD_TOP + 8, anchor: "start", baseline: "hanging" },
    { key: "priority", x: midX, y: PAD_TOP, w: right - midX, h: midY - PAD_TOP, lx: right - 8, ly: PAD_TOP + 8, anchor: "end", baseline: "hanging" },
    { key: "deprioritize", x: PAD_LEFT, y: midY, w: midX - PAD_LEFT, h: bottom - midY, lx: PAD_LEFT + 8, ly: bottom - 8, anchor: "start", baseline: "auto" },
    { key: "nurture", x: midX, y: midY, w: right - midX, h: bottom - midY, lx: right - 8, ly: bottom - 8, anchor: "end", baseline: "auto" },
  ];

  const hovered = hover ? priorities.find((p) => p.company.id === hover) ?? null : null;

  return (
    <div ref={ref} className="bee-fill relative w-full" style={{ minHeight }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block" role="img" aria-label={t("ariaLabel")}>
        {/* Quadrant grounds: white, except the selected one in a whisper of the hue. */}
        {quadrants.map((q) => (
          <rect
            key={`g-${q.key}`}
            x={q.x}
            y={q.y}
            width={Math.max(0, q.w)}
            height={Math.max(0, q.h)}
            fill={selected === q.key ? mix(TONE.urgency, 8, "transparent") : "transparent"}
            className={onSelectQuadrant ? "cursor-pointer" : undefined}
            onClick={onSelectQuadrant ? () => onSelectQuadrant(q.key) : undefined}
          />
        ))}

        {/* 50/50 thresholds */}
        <line x1={midX} x2={midX} y1={PAD_TOP} y2={bottom} stroke="var(--color-text)" opacity={0.18} strokeDasharray="3 3" />
        <line x1={PAD_LEFT} x2={right} y1={midY} y2={midY} stroke="var(--color-text)" opacity={0.18} strokeDasharray="3 3" />

        {/* Quadrant names inside the plot, in ink */}
        {quadrants.map((q) => (
          <text
            key={q.key}
            x={q.lx}
            y={q.ly}
            textAnchor={q.anchor}
            dominantBaseline={q.baseline}
            fill="var(--color-text)"
            opacity={selected && selected !== q.key ? 0.4 : 0.8}
            fontWeight={600}
            style={{ fontSize: "var(--bee-fs-body-2)", pointerEvents: "none" }}
          >
            {tQ(`${q.key}.label`)}
          </text>
        ))}

        {/* Axes with 0 · 50 · 100 */}
        {[0, 50, 100].map((v) => (
          <text key={`x${v}`} x={toX(v)} y={bottom + 14} textAnchor={v === 0 ? "start" : v === 100 ? "end" : "middle"} fill="var(--color-text-muted)" style={{ fontSize: "var(--bee-fs-body-2)" }}>
            {v}
          </text>
        ))}
        {[0, 50, 100].map((v) => (
          <text key={`y${v}`} x={PAD_LEFT - 6} y={toY(v)} textAnchor="end" dominantBaseline="middle" fill="var(--color-text-muted)" style={{ fontSize: "var(--bee-fs-body-2)" }}>
            {v}
          </text>
        ))}
        <text x={right} y={H - 4} textAnchor="end" fill="var(--color-text-muted)" style={{ fontSize: "var(--bee-fs-body-2)" }}>
          {t("fitAxis")}
        </text>
        <text x={10} y={(PAD_TOP + bottom) / 2} textAnchor="middle" fill="var(--color-text-muted)" transform={`rotate(-90 10 ${(PAD_TOP + bottom) / 2})`} style={{ fontSize: "var(--bee-fs-body-2)" }}>
          {t("intentAxis")}
        </text>

        {priorities.map((p) => (
          <circle
            key={p.company.id}
            cx={toX(p.fit)}
            cy={toY(p.intent)}
            r={hover === p.company.id ? 8 : 6}
            fill={QUADRANT_COLOR[p.quadrant]}
            stroke={p.quadrant === "deprioritize" ? "var(--color-divider)" : "var(--color-card)"}
            strokeWidth={p.quadrant === "deprioritize" ? 1 : 2}
            opacity={selected && selected !== p.quadrant ? 0.3 : 1}
            className="cursor-pointer"
            onMouseEnter={() => setHover(p.company.id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => router.push(`${base}/companies/${p.company.id}`)}
          />
        ))}
      </svg>
      {hovered && (
        <div
          className={`pointer-events-none absolute whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2 py-1 text-xs font-medium text-[var(--color-card)] ${
            toX(hovered.fit) / W > 0.7 ? "-translate-x-full" : ""
          }`}
          style={{ left: toX(hovered.fit), top: Math.max(0, toY(hovered.intent) - 36) }}
        >
          {t("tooltip", { name: hovered.company.name, fit: hovered.fit, intent: Math.round(hovered.intent) })}
        </div>
      )}
    </div>
  );
}
