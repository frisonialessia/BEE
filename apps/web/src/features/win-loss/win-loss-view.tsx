"use client";

import { CalendarClock, DollarSign, Percent, Trophy } from "lucide-react";

import { CompetitorBreakdown } from "@/components/win-loss/competitor-breakdown";
import { LossReasonChart } from "@/components/win-loss/loss-reason-chart";
import { MeddicCorrelationChart } from "@/components/win-loss/meddic-correlation-chart";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { computeWinLoss } from "@/lib/win-loss";

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Ganado/Perdido — por qué se ganan y se pierden los deals, no solo cuántos.
 *  Todo calculado en el cliente a partir de las oportunidades ya cargadas
 *  (mismo patrón que Pronóstico/Tendencias) — nada nuevo del lado del
 *  backend salvo los dos campos que el rep llena al cerrar un deal
 *  (razón de pérdida, competidor) desde el panel del drawer. */
export function WinLossView() {
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 300);

  const opportunities = oppsResult?.data ?? [];
  const live = oppsResult?.live ?? false;
  const summary = computeWinLoss(opportunities);

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Inteligencia de ingresos</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">Ganado/Perdido</h1>
            <p className="bee-caption mt-1">
              Por qué se ganan y se pierden los deals — razones, competidores, y si calificar más
              realmente se traduce en más cierres
            </p>
          </div>
          <Badge variant={live ? "success" : "warning"}>{live ? "En vivo" : "Datos demo"}</Badge>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-56" />
        </div>
      ) : summary.totalClosed === 0 ? (
        <div className="bee-bento bee-bento-pad py-12 text-center">
          <p className="text-sm text-muted-foreground">Todavía no hay ninguna oportunidad cerrada.</p>
          <p className="bee-caption mt-1">
            Marca una oportunidad como ganada o perdida desde su panel de detalle para empezar a ver
            el análisis aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Tasa de cierre"
              value={summary.winRate !== null ? `${Math.round(summary.winRate * 100)}%` : "—"}
              hint={`${summary.won} ganadas de ${summary.totalClosed} cerradas`}
              icon={Percent}
            />
            <MetricCard
              label="Valor ganado"
              value={currency.format(summary.wonValue)}
              hint="Suma de monto en deals ganados"
              icon={Trophy}
            />
            <MetricCard
              label="Valor perdido"
              value={currency.format(summary.lostValue)}
              hint="Suma de monto en deals perdidos"
              icon={DollarSign}
            />
            <MetricCard
              label="Días a cierre (ganados)"
              value={
                summary.avgDaysToCloseWon !== null ? `${Math.round(summary.avgDaysToCloseWon)}d` : "—"
              }
              hint={
                summary.avgDaysToCloseWon === null
                  ? summary.avgDaysToCloseLost !== null
                    ? `Sin ganados todavía · ${Math.round(summary.avgDaysToCloseLost)}d perdidos en promedio`
                    : "Sin deals cerrados con fecha registrada"
                  : summary.avgDaysToCloseLost !== null
                    ? `${Math.round(summary.avgDaysToCloseLost)}d perdidos en promedio`
                    : "Promedio en deals ganados"
              }
              icon={CalendarClock}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="bee-surface bee-bento-pad">
              <h3 className="mb-1 text-sm font-semibold">Razones de pérdida</h3>
              <p className="bee-caption mb-4">Qué se repite más entre los deals perdidos</p>
              <LossReasonChart stats={summary.reasonBreakdown} />
            </section>

            <section className="bee-surface bee-bento-pad">
              <h3 className="mb-1 text-sm font-semibold">Competidores</h3>
              <p className="bee-caption mb-4">Contra quién competimos de verdad al cerrar</p>
              <CompetitorBreakdown stats={summary.competitorBreakdown} />
            </section>
          </div>

          <section className="bee-surface bee-bento-pad">
            <h3 className="mb-1 text-sm font-semibold">Calificación MEDDIC vs. resultado</h3>
            <p className="bee-caption mb-4">
              Tasa de cierre real según qué tan calificado estaba el deal — si calificar más de verdad
              se traduce en más cierres ganados, o si es solo un checklist sin impacto
            </p>
            <MeddicCorrelationChart stats={summary.meddicCorrelation} />
          </section>
        </div>
      )}
    </div>
  );
}
