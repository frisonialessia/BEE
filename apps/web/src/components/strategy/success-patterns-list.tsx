import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { SuccessPattern } from "@/lib/api/feedback";

const CONFIDENCE_VARIANT: Record<SuccessPattern["confidence"], "outline" | "warning" | "success"> = {
  low: "outline",
  medium: "warning",
  high: "success",
};

/** Lo que BEE aprendió de deals cerrados de verdad — el paso "aprender" del
 *  loop percibir→juzgar→planear→actuar→aprender, hecho visible. Cada fila ya
 *  pasó el piso mínimo de muestra en el backend: no hay patrón inventado acá,
 *  si no hay historial suficiente la lista sale vacía. */
export function SuccessPatternsList({ patterns }: { patterns: SuccessPattern[] }) {
  const t = useTranslations("sharedB.successPatterns");

  if (patterns.length === 0) {
    return (
      <div className="bee-bento bee-bento-pad py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {t("emptyTitle")}
        </p>
        <p className="bee-caption mt-1">
          {t("emptySubtitle")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {patterns.map((p) => (
        <div
          key={`${p.signal_type}-${p.playbook}-${p.channel}-${p.generator}`}
          className="bee-bento bee-bento-pad flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">
              {t("viaChannel", { playbook: p.playbook, channel: p.channel })}
            </p>
            <p className="bee-caption mt-0.5">
              {p.signal_type} · {t("dealsClosed", { count: p.sample_size })}
              {p.avg_days_to_close != null
                ? ` · ${t("avgDaysToClose", { days: Math.round(p.avg_days_to_close) })}`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <p className="text-sm font-semibold" style={{ color: "var(--color-chart-5)" }}>
              {Math.round(p.win_rate * 100)}%
            </p>
            <Badge variant={CONFIDENCE_VARIANT[p.confidence]}>{t(`confidenceLabel.${p.confidence}`)}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
