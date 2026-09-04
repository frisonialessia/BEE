"use client";

import { useLocale, useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Locale } from "@/i18n/locales";
import { getLossReasonLabels } from "@/lib/format";
import type { LossReasonStat } from "@/lib/win-loss";

/** Barras horizontales rankeadas por frecuencia — la razón más común de
 *  pérdida arriba. Sin librería de gráficas, como el resto de la BI de BEE;
 *  el tooltip sí es real (Radix, no el title nativo del navegador) para que
 *  el valor exacto se pueda leer al pasar el mouse sin depender del ancho
 *  fijo de la etiqueta truncada. */
export function LossReasonChart({ stats }: { stats: LossReasonStat[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("forecastWinLoss.lossReasonChart");
  const lossReasonLabels = getLossReasonLabels(locale);

  if (stats.length === 0) {
    return <p className="py-8 text-center text-xs text-muted-foreground">{t("empty")}</p>;
  }

  const maxCount = Math.max(1, ...stats.map((s) => s.count));

  return (
    <div className="bee-fill flex min-h-[160px] flex-col justify-evenly gap-2">
      {stats.map((s) => {
        const label = s.reason === "unspecified" ? t("unspecified") : lossReasonLabels[s.reason];
        return (
          <div key={s.reason} className="flex items-center gap-4">
            <p className="w-40 shrink-0 truncate text-xs text-muted-foreground">{label}</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative h-5 flex-1 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-primary)]/20">
                  <div
                    className="h-full rounded-[var(--radius-sm)] bg-[var(--color-text-muted)]/40 transition-[width] duration-300"
                    style={{ width: `${Math.max((s.count / maxCount) * 100, 4)}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t("tooltip", { label, count: s.count, percent: Math.round(s.fraction * 100) })}
              </TooltipContent>
            </Tooltip>
            <p className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {s.count} · {Math.round(s.fraction * 100)}%
            </p>
          </div>
        );
      })}
    </div>
  );
}
