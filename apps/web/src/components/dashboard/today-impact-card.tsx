import { Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";

import type { TodayImpact } from "@/lib/today-impact";

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
  notation: "compact",
});

/** "Si actúas hoy…" — el número que abre la mañana. Nunca inventa una
 *  cifra: si no hay suficiente histórico de cierre o ningún monto cargado
 *  en las oportunidades, cae a un mensaje honesto en vez de un $0 o un
 *  estimado disfrazado de medición. Ver `computeTodayImpact`. */
export function TodayImpactCard({ impact }: { impact: TodayImpact }) {
  const { hotSignalsToday, projectedUplift, winRate, avgDealValue, winRateSampleSize } = impact;

  if (hotSignalsToday.length === 0) {
    return (
      <section className="bee-bento bee-bento--primary bee-bento-pad-lg mb-4 flex items-center gap-3">
        <Sparkles className="size-5 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Ninguna señal de alta intención detectada en las últimas 24h — nada urgente que proyectar hoy.
        </p>
      </section>
    );
  }

  return (
    <section className="bee-bento bee-bento--primary bee-bento-pad-lg mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-chart-5)]/20">
            <TrendingUp className="size-4.5" style={{ color: "var(--color-chart-5)" }} />
          </span>
          <div>
            <p className="bee-eyebrow">Si actúas hoy</p>
            {projectedUplift !== null ? (
              <>
                <p className="mt-1 text-2xl font-bold tracking-tight">
                  +{currency.format(projectedUplift)} de pipeline proyectado
                </p>
                <p className="bee-caption mt-1">
                  {hotSignalsToday.length} señal{hotSignalsToday.length === 1 ? "" : "es"} de alta intención
                  hoy × {Math.round((winRate ?? 0) * 100)}% de cierre histórico ({winRateSampleSize} deals) ×{" "}
                  {currency.format(avgDealValue ?? 0)} de valor promedio por deal
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-2xl font-bold tracking-tight">
                  {hotSignalsToday.length} señal{hotSignalsToday.length === 1 ? "" : "es"} de alta intención hoy
                </p>
                <p className="bee-caption mt-1">
                  {winRateSampleSize < 5
                    ? `Faltan deals cerrados para calcular un impacto en $ real (${winRateSampleSize}/5 mínimo)`
                    : "Agrega el monto estimado a tus oportunidades para ver el impacto en $"}
                </p>
              </>
            )}
          </div>
        </div>
        <Link href="/dashboard/priority" className="bee-btn-ghost shrink-0 text-xs">
          Ver estas cuentas
        </Link>
      </div>
    </section>
  );
}
