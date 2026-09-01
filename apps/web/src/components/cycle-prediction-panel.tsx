"use client";

import { Clock, Radar } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCyclePrediction } from "@/hooks/queries/use-artifacts";
import type { Locale } from "@/i18n/locales";
import { formatLongDate } from "@/lib/i18n/format";
import { signalTypeLabels } from "@/lib/format";
import type { SignalType } from "@/types/domain";
import type { CycleSignalRecalibration } from "@/types/extended";

const CONFIDENCE_KEYS = ["low", "medium", "high"] as const;

/** `confidence` off the prediction is a free-form string from the backend
 *  — only the three known levels have a translated label, anything else
 *  falls back to the raw value, same as the old `CONFIDENCE_LABEL[x] ?? x`
 *  lookup this replaces. */
function confidenceLabel(t: ReturnType<typeof useTranslations>, confidence: string): string {
  return (CONFIDENCE_KEYS as readonly string[]).includes(confidence)
    ? t(`confidence.${confidence}`)
    : confidence;
}

function formatCloseDate(iso: string, locale: Locale): string {
  return formatLongDate(`${iso}T00:00:00`, locale);
}

/** Predicción de ciclo de venta — cuántos días le faltan a ESTA oportunidad
 *  abierta para cerrarse, según la mediana de deals cerrados comparables de
 *  esta misma cuenta (ver CyclePredictorService). Se monta con
 *  `key={opportunity.id}` desde el drawer, igual que los demás paneles.
 *
 *  `available: false` es una respuesta válida, no un error — todavía no hay
 *  suficiente historial comparable, o la oportunidad ya está cerrada. En
 *  ambos casos el panel explica por qué en vez de no mostrar nada o inventar
 *  un número. */
export function CyclePredictionPanel({ opportunityId }: { opportunityId: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("shared.cyclePrediction");
  const { data: result, isLoading } = useCyclePrediction(opportunityId);

  if (isLoading) return <Skeleton className="h-32" />;

  const prediction = result?.data;
  if (!prediction) return null; // fetch failed outright — nothing honest to show

  return (
    <section className="bee-surface bee-bento-pad">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 bee-card-title">
          <Clock className="size-4 stroke-[1.5] text-muted-foreground" />
          {t("heading")}
        </h3>
        {result?.live === false && <Badge variant="warning">{t("demoData")}</Badge>}
      </div>

      {!prediction.available ? (
        <p className="text-sm text-muted-foreground">{prediction.reason}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-2xl font-semibold tabular-nums">
              {t("days", { count: prediction.predicted_cycle_days ?? 0 })}
            </span>
            <span className="text-sm text-muted-foreground">{t("estimatedCycle")}</span>
            {prediction.confidence && (
              <Badge variant="outline" className="ml-1">
                {confidenceLabel(t, prediction.confidence)}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t("estimatedClose")}</p>
              <p className="font-medium">
                {prediction.predicted_close_date ? formatCloseDate(prediction.predicted_close_date, locale) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {prediction.is_overdue ? t("daysOverdue") : t("daysRemaining")}
              </p>
              <p className={`font-medium tabular-nums ${prediction.is_overdue ? "text-[var(--color-chart-2)]" : ""}`}>
                {prediction.is_overdue
                  ? t("days", { count: Math.abs(prediction.days_remaining ?? 0) })
                  : t("days", { count: prediction.days_remaining ?? 0 })}
              </p>
            </div>
          </div>

          {prediction.is_overdue && (
            <Badge variant="destructive">{t("overdueWarning")}</Badge>
          )}

          <p className="text-xs text-muted-foreground">
            {t("basedOn", { count: prediction.cohort_size })}
            {prediction.cohort_basis ? ` — ${prediction.cohort_basis}` : ""}.
          </p>

          {prediction.signal_recalibration?.available && (
            <SignalRecalibrationNote recal={prediction.signal_recalibration} />
          )}
        </div>
      )}
    </section>
  );
}

/** Recalibración en vivo: ¿el mercado hizo algo nuevo sobre esta cuenta
 *  desde que el deal se abrió, y eso históricamente adelantó o atrasó el
 *  cierre en deals comparables? Insight adicional, independiente del
 *  número principal — nunca se mezcla con `predicted_cycle_days`, solo se
 *  muestra junto a él. Ver el docstring de CyclePredictorService. */
function SignalRecalibrationNote({ recal }: { recal: CycleSignalRecalibration }) {
  const t = useTranslations("shared.cyclePrediction.recalibration");
  if (!recal.available) return null;
  const faster = (recal.delta_days ?? 0) < 0;

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <Radar className="size-3.5 stroke-[1.5]" />
        {t("title")}
      </p>
      <p className="mt-1.5 text-muted-foreground">
        {t.rich("summary", {
          direction: faster ? t("faster") : t("slower"),
          withDays: recal.with_signal_median_days ?? 0,
          withCount: recal.with_signal_count,
          withoutDays: recal.without_signal_median_days ?? 0,
          withoutCount: recal.without_signal_count,
          strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
        })}
      </p>
      {recal.target_has_new_signal && (
        <p className="mt-1.5">
          <Badge variant="outline">
            {recal.target_new_signal_types.length > 0
              ? t("newSignalWithTypes", {
                  types: recal.target_new_signal_types
                    .map((type) => signalTypeLabels[type as SignalType] ?? type)
                    .join(", "),
                })
              : t("newSignal")}
          </Badge>
        </p>
      )}
    </div>
  );
}
