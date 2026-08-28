"use client";

import { Clock, Radar } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCyclePrediction } from "@/hooks/queries/use-artifacts";
import { signalTypeLabels } from "@/lib/format";
import type { SignalType } from "@/types/domain";
import type { CycleSignalRecalibration } from "@/types/extended";

const CONFIDENCE_LABEL: Record<string, string> = {
  low: "Confianza baja",
  medium: "Confianza media",
  high: "Confianza alta",
};

function formatCloseDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
  const { data: result, isLoading } = useCyclePrediction(opportunityId);

  if (isLoading) return <Skeleton className="h-32" />;

  const prediction = result?.data;
  if (!prediction) return null; // fetch failed outright — nothing honest to show

  return (
    <section className="bee-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock className="size-4 stroke-[1.5] text-muted-foreground" />
          Predicción de ciclo de venta
        </h3>
        {result?.live === false && <Badge variant="warning">Datos demo</Badge>}
      </div>

      {!prediction.available ? (
        <p className="text-sm text-muted-foreground">{prediction.reason}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-2xl font-semibold tabular-nums">
              {prediction.predicted_cycle_days} días
            </span>
            <span className="text-sm text-muted-foreground">de ciclo estimado</span>
            {prediction.confidence && (
              <Badge variant="outline" className="ml-1">
                {CONFIDENCE_LABEL[prediction.confidence] ?? prediction.confidence}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Cierre estimado</p>
              <p className="font-medium">
                {prediction.predicted_close_date ? formatCloseDate(prediction.predicted_close_date) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {prediction.is_overdue ? "Días de retraso" : "Días restantes"}
              </p>
              <p className={`font-medium tabular-nums ${prediction.is_overdue ? "text-[var(--color-chart-2)]" : ""}`}>
                {prediction.is_overdue
                  ? `${Math.abs(prediction.days_remaining ?? 0)} días`
                  : `${prediction.days_remaining} días`}
              </p>
            </div>
          </div>

          {prediction.is_overdue && (
            <Badge variant="destructive">Va más lento de lo esperado para deals así</Badge>
          )}

          <p className="text-xs text-muted-foreground">
            Basado en {prediction.cohort_size} {prediction.cohort_size === 1 ? "deal cerrado" : "deals cerrados"}
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
  if (!recal.available) return null;
  const faster = (recal.delta_days ?? 0) < 0;

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <Radar className="size-3.5 stroke-[1.5]" />
        Recalibración por señales de mercado
      </p>
      <p className="mt-1.5 text-muted-foreground">
        Deals con una señal nueva de mercado durante el ciclo cerraron en {faster ? "menos" : "más"} tiempo:{" "}
        <span className="font-medium text-foreground">{recal.with_signal_median_days} días</span> de mediana
        (n={recal.with_signal_count}) vs.{" "}
        <span className="font-medium text-foreground">{recal.without_signal_median_days} días</span> sin ella
        (n={recal.without_signal_count}).
      </p>
      {recal.target_has_new_signal && (
        <p className="mt-1.5">
          <Badge variant="outline">
            Esta cuenta ya tuvo una señal nueva
            {recal.target_new_signal_types.length > 0
              ? `: ${recal.target_new_signal_types.map((t) => signalTypeLabels[t as SignalType] ?? t).join(", ")}`
              : ""}
          </Badge>
        </p>
      )}
    </div>
  );
}
