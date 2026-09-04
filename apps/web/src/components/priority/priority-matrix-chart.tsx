"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { mix } from "@/components/charts/palette";
import { useBoxSize } from "@/components/charts/use-box-size";
import type { CompanyPriority } from "@/lib/icp";
import { useDashboardBase } from "@/lib/demo/mode";

/** Exported so the legend next to the chart (priority-matrix-view.tsx)
 *  never drifts out of sync with the dots' actual colors. */
export const QUADRANT_COLOR: Record<CompanyPriority["quadrant"], string> = {
  priority: "var(--color-chart-4)",
  nurture: "var(--color-chart-6)",
  opportunistic: "var(--color-chart-1)",
  deprioritize: "var(--color-text-muted)",
};

const PAD_LEFT = 34;
const PAD_BOTTOM = 30;
const PAD_TOP = 10;
const PAD_RIGHT = 12;

/**
 * Fit × intención — cada empresa es un punto. Llena su caja (use-box-size)
 * como toda gráfica de BEE; los cuatro cuadrantes llevan su nombre escrito
 * adentro, para que "Prioridad máxima" se entienda mirando la gráfica y no
 * haga falta leer una leyenda aparte. Arriba a la derecha es donde hay que
 * mirar: encaja con el ICP y está caliente ahora.
 */
export function PriorityMatrixChart({ priorities, minHeight = 240 }: { priorities: CompanyPriority[]; minHeight?: number }) {
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

  const quadrants: { key: CompanyPriority["quadrant"]; x: number; y: number; anchor: "start" | "end"; baseline: "hanging" | "auto" }[] = [
    { key: "opportunistic", x: PAD_LEFT + 8, y: PAD_TOP + 8, anchor: "start", baseline: "hanging" },
    { key: "priority", x: W - PAD_RIGHT - 8, y: PAD_TOP + 8, anchor: "end", baseline: "hanging" },
    { key: "deprioritize", x: PAD_LEFT + 8, y: H - PAD_BOTTOM - 8, anchor: "start", baseline: "auto" },
    { key: "nurture", x: W - PAD_RIGHT - 8, y: H - PAD_BOTTOM - 8, anchor: "end", baseline: "auto" },
  ];

  const hovered = hover ? priorities.find((p) => p.company.id === hover) ?? null : null;

  return (
    <div ref={ref} className="bee-fill relative w-full" style={{ minHeight }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block" role="img" aria-label={t("ariaLabel")}>
        {/* Quadrant grounds — a whisper of each quadrant's own color. */}
        <rect x={PAD_LEFT} y={PAD_TOP} width={midX - PAD_LEFT} height={midY - PAD_TOP} fill={mix(QUADRANT_COLOR.opportunistic, 14, "transparent")} />
        <rect x={midX} y={PAD_TOP} width={W - PAD_RIGHT - midX} height={midY - PAD_TOP} fill={mix(QUADRANT_COLOR.priority, 16, "transparent")} />
        <rect x={PAD_LEFT} y={midY} width={midX - PAD_LEFT} height={H - PAD_BOTTOM - midY} fill={mix(QUADRANT_COLOR.deprioritize, 8, "transparent")} />
        <rect x={midX} y={midY} width={W - PAD_RIGHT - midX} height={H - PAD_BOTTOM - midY} fill={mix(QUADRANT_COLOR.nurture, 14, "transparent")} />

        {/* 50/50 thresholds */}
        <line x1={midX} x2={midX} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke="var(--color-text)" opacity={0.18} strokeDasharray="3 3" />
        <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={midY} y2={midY} stroke="var(--color-text)" opacity={0.18} strokeDasharray="3 3" />

        {/* Quadrant names inside the plot */}
        {quadrants.map((q) => (
          <text
            key={q.key}
            x={q.x}
            y={q.y}
            textAnchor={q.anchor}
            dominantBaseline={q.baseline}
            fill="var(--color-text)"
            opacity={0.55}
            fontWeight={600}
            style={{ fontSize: "var(--bee-fs-body-2)" }}
          >
            {tQ(`${q.key}.label`)}
          </text>
        ))}

        {/* Axes with 0 · 50 · 100 */}
        {[0, 50, 100].map((v) => (
          <text key={`x${v}`} x={toX(v)} y={H - PAD_BOTTOM + 14} textAnchor={v === 0 ? "start" : v === 100 ? "end" : "middle"} fill="var(--color-text-muted)" style={{ fontSize: "var(--bee-fs-body-2)" }}>
            {v}
          </text>
        ))}
        {[0, 50, 100].map((v) => (
          <text key={`y${v}`} x={PAD_LEFT - 6} y={toY(v)} textAnchor="end" dominantBaseline="middle" fill="var(--color-text-muted)" style={{ fontSize: "var(--bee-fs-body-2)" }}>
            {v}
          </text>
        ))}
        <text x={W - PAD_RIGHT} y={H - 4} textAnchor="end" fill="var(--color-text-muted)" style={{ fontSize: "var(--bee-fs-body-2)" }}>
          {t("fitAxis")}
        </text>
        <text x={12} y={PAD_TOP} textAnchor="end" fill="var(--color-text-muted)" transform={`rotate(-90 12 ${PAD_TOP})`} style={{ fontSize: "var(--bee-fs-body-2)" }}>
          {t("intentAxis")}
        </text>

        {priorities.map((p) => (
          <circle
            key={p.company.id}
            cx={toX(p.fit)}
            cy={toY(p.intent)}
            r={hover === p.company.id ? 8 : 6}
            fill={QUADRANT_COLOR[p.quadrant]}
            stroke="var(--color-card)"
            strokeWidth={2}
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
