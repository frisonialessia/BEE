import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DailySignalPoint } from "@/lib/signal-trends";

/** Volumen de señales por día — barra total con la porción de alta
 *  intención (score ≥ 75) resaltada encima, mismo patrón visual que
 *  ForecastBarChart (total tenue + porción destacada). Sin librería de
 *  gráficas, tooltip real (Radix) por barra. */
export function SignalVolumeChart({ points }: { points: DailySignalPoint[] }) {
  const t = useTranslations("sharedB.signalVolume");
  const anyData = points.some((p) => p.count > 0);
  if (!anyData) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  const maxCount = Math.max(1, ...points.map((p) => p.count));

  return (
    <div className="bee-fill flex min-h-[160px] items-end gap-2 overflow-x-auto pb-1">
      {points.map((p, i) => {
        const totalPct = (p.count / maxCount) * 100;
        const hotPct = (p.hotCount / maxCount) * 100;
        return (
          <div key={p.key} className="flex h-full min-w-4 flex-1 flex-col items-center gap-1 sm:min-w-8">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative flex w-full flex-1 items-end justify-center rounded-t-[var(--radius-sm)] bg-[var(--color-primary)]/40">
                  <div
                    className="w-full rounded-t-[var(--radius-sm)] bg-[var(--color-chart-4)]/50 transition-[height] duration-300"
                    style={{ height: `${Math.max(totalPct, p.count > 0 ? 4 : 0)}%` }}
                  />
                  <div
                    className="absolute bottom-0 w-full rounded-t-[var(--radius-sm)] bg-[var(--success)] transition-[height] duration-300"
                    style={{ height: `${Math.max(hotPct, p.hotCount > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {p.hotCount > 0
                  ? t("tooltipHot", { label: p.label, count: p.count, hotCount: p.hotCount })
                  : t("tooltip", { label: p.label, count: p.count })}
              </TooltipContent>
            </Tooltip>
            {/* 14 day labels don't fit a phone-width card (the row used to
                scroll sideways with no visible scrollbar, showing 8 of 14
                days) — every other label below sm, all of them above. */}
            <p className={cn("bee-micro whitespace-nowrap", i % 2 === 1 && "hidden sm:block")}>
              {p.label.split(" ")[0]}
            </p>
          </div>
        );
      })}
    </div>
  );
}
