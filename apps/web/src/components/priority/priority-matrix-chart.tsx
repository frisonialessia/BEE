"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type { CompanyPriority } from "@/lib/icp";

/** Exported so the legend next to the chart (priority-matrix-view.tsx)
 *  never drifts out of sync with the dots' actual colors. */
export const QUADRANT_COLOR: Record<CompanyPriority["quadrant"], string> = {
  priority: "var(--color-chart-4)",
  nurture: "var(--color-chart-6)",
  opportunistic: "var(--color-chart-1)",
  deprioritize: "var(--color-text-muted)",
};

const SIZE = 320;
const PAD = 24;

/** Dispersión fit × intención — cada empresa es un punto. Sin librería de
 *  gráficas, como el resto de la BI de BEE: SVG a mano, ejes 0–100. El eje Y
 *  se invierte (intención alta arriba) porque así se lee un cuadrante de
 *  prioridad de forma natural — arriba a la derecha es donde hay que mirar. */
export function PriorityMatrixChart({ priorities }: { priorities: CompanyPriority[] }) {
  const router = useRouter();
  const t = useTranslations("sharedB.priorityMatrix");
  const plot = SIZE - PAD * 2;

  function toX(fit: number) {
    return PAD + (fit / 100) * plot;
  }
  function toY(intent: number) {
    return PAD + ((100 - intent) / 100) * plot;
  }

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      className="max-w-[360px]"
      role="img"
      aria-label={t("ariaLabel")}
    >
      {/* Cuadrantes de fondo */}
      <rect x={PAD} y={PAD} width={plot / 2} height={plot / 2} fill="var(--color-chart-1)" opacity={0.06} />
      <rect x={PAD + plot / 2} y={PAD} width={plot / 2} height={plot / 2} fill="var(--color-chart-4)" opacity={0.08} />
      <rect x={PAD} y={PAD + plot / 2} width={plot / 2} height={plot / 2} fill="var(--color-text-muted)" opacity={0.05} />
      <rect
        x={PAD + plot / 2}
        y={PAD + plot / 2}
        width={plot / 2}
        height={plot / 2}
        fill="var(--color-chart-6)"
        opacity={0.06}
      />

      {/* Líneas de umbral (50/50) */}
      <line x1={toX(50)} y1={PAD} x2={toX(50)} y2={SIZE - PAD} stroke="var(--color-divider)" strokeWidth={1} />
      <line x1={PAD} y1={toY(50)} x2={SIZE - PAD} y2={toY(50)} stroke="var(--color-divider)" strokeWidth={1} />

      {/* Ejes */}
      <text x={SIZE / 2} y={SIZE - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
        {t("fitAxis")}
      </text>
      <text
        x={10}
        y={SIZE / 2}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize={11}
        transform={`rotate(-90 10 ${SIZE / 2})`}
      >
        {t("intentAxis")}
      </text>

      {priorities.map((p) => (
        <circle
          key={p.company.id}
          cx={toX(p.fit)}
          cy={toY(p.intent)}
          r={5}
          fill={QUADRANT_COLOR[p.quadrant]}
          stroke="var(--color-background)"
          strokeWidth={1.5}
          className="cursor-pointer transition-opacity hover:opacity-70"
          onClick={() => router.push(`/dashboard/companies/${p.company.id}`)}
        >
          <title>
            {t("tooltip", { name: p.company.name, fit: p.fit, intent: Math.round(p.intent) })}
          </title>
        </circle>
      ))}
    </svg>
  );
}
