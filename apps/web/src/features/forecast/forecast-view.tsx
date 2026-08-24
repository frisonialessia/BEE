"use client";

import { AlertTriangle, DollarSign, TrendingUp, Trophy } from "lucide-react";

import { ForecastBarChart } from "@/components/forecast/forecast-bar-chart";
import { ScenarioSimulatorPanel } from "@/components/forecast/scenario-simulator-panel";
import { TrendsChart } from "@/components/forecast/trends-chart";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { computeForecast, qualificationScore, type AtRiskOpportunity } from "@/lib/forecast";
import { computeMonthlyTrends } from "@/lib/trends";

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const RISK_LABEL: Record<AtRiskOpportunity["reason"], string> = {
  sin_fecha_de_cierre: "Sin fecha de cierre",
  fecha_vencida: "Fecha de cierre vencida",
  poco_calificada: "Poco calificada para su etapa",
};

/** Pronóstico de ingresos — pipeline ponderado por probabilidad de cierre,
 *  deals en riesgo, y el simulador de escenarios "qué pasaría si" — el
 *  mismo motor financiero que le pregunta un director, todo en un lugar. */
export function ForecastView() {
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 200);
  const { data: companiesResult } = useCompanies(200);
  const { openOpportunity } = useOpportunityDrawer();

  const opportunities = oppsResult?.data ?? [];
  const live = oppsResult?.live ?? false;
  const companyById = new Map((companiesResult?.data ?? []).map((c) => [c.id, c]));

  const today = new Date();
  const forecast = computeForecast(opportunities, today);
  const trends = computeMonthlyTrends(opportunities, today);
  const withAmount = opportunities.some((o) => o.amount !== null);
  const hasClosedHistory = trends.some((t) => t.won + t.lost > 0);

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Inteligencia de ingresos</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">Pronóstico</h1>
            <p className="bee-caption mt-1">
              Pipeline ponderado por probabilidad de cierre, mes a mes, y qué deals están en riesgo
            </p>
          </div>
          <Badge variant={live ? "success" : "warning"}>{live ? "En vivo" : "Datos demo"}</Badge>
        </div>
      </header>

      <Tabs defaultValue="pronostico">
        <TabsList className="border border-border bg-background">
          <TabsTrigger value="pronostico" className="rounded-sm">
            Pronóstico
          </TabsTrigger>
          <TabsTrigger value="simulador" className="rounded-sm">
            Simulador de escenarios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pronostico" className="mt-6">
          {isLoading ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
              <Skeleton className="h-56" />
            </div>
          ) : !withAmount ? (
            <div className="bee-bento bee-bento-pad py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Todavía no hay monto estimado en ninguna oportunidad.
              </p>
              <p className="bee-caption mt-1">
                Agrega el monto y la fecha esperada de cierre desde el panel de calificación de cada
                oportunidad para ver el pronóstico.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="Pipeline abierto"
                  value={currency.format(forecast.pipelineValue)}
                  hint={`${forecast.openCount} oportunidades sin cerrar`}
                  icon={DollarSign}
                />
                <MetricCard
                  label="Pronóstico ponderado"
                  value={currency.format(forecast.weightedForecast)}
                  hint={
                    forecast.scoreBucketStats.length > 0
                      ? "Monto × probabilidad real de cierre (histórico) o por etapa"
                      : "Monto × probabilidad de cierre por etapa"
                  }
                  icon={TrendingUp}
                />
                <MetricCard
                  label="Ganado"
                  value={currency.format(forecast.wonValue)}
                  hint="Oportunidades cerradas como ganadas"
                  icon={Trophy}
                />
                <MetricCard
                  label="En riesgo"
                  value={forecast.atRisk.length}
                  hint="Sin fecha, vencidas o poco calificadas"
                  icon={AlertTriangle}
                  tone={forecast.atRisk.length > 0 ? "warm" : "default"}
                />
              </div>

              <section className="bee-surface p-5">
                <h3 className="mb-4 text-sm font-semibold">Pronóstico por mes</h3>
                <ForecastBarChart buckets={forecast.byMonth} />
              </section>

              {hasClosedHistory && (
                <section className="bee-surface p-5">
                  <h3 className="mb-1 text-sm font-semibold">Tendencia de cierre</h3>
                  <p className="bee-caption mb-4">
                    Oportunidades creadas por mes (barra) y tasa de cierre de lo que se resolvió ese mes
                    (número arriba)
                  </p>
                  <TrendsChart points={trends} />
                </section>
              )}

              {forecast.scoreBucketStats.length > 0 && (
                <section className="bee-surface p-5">
                  <h3 className="mb-1 text-sm font-semibold">Precisión del pronóstico</h3>
                  <p className="bee-caption mb-4">
                    Ya hay suficiente histórico para calcular la probabilidad de cierre real por rango de
                    score, en vez de la fija por etapa — esto es lo que se está usando ahora mismo:
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                    {forecast.scoreBucketStats.map((s) => (
                      <div
                        key={s.bucketStart}
                        className="rounded-[var(--radius-md)] bg-[var(--color-primary)]/25 p-3 text-center"
                      >
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Score {s.bucketStart}-{s.bucketStart + 19}
                        </p>
                        <p className="mt-1 text-lg font-semibold">{Math.round(s.winRate * 100)}%</p>
                        <p className="bee-micro">{s.sampleSize} deals cerrados</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="bee-surface p-5">
                <h3 className="mb-3 text-sm font-semibold">Deals en riesgo</h3>
                {forecast.atRisk.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Ninguna oportunidad abierta está en riesgo por ahora.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {forecast.atRisk.map(({ opportunity, reason }) => {
                      const company = opportunity.company_id
                        ? companyById.get(opportunity.company_id)
                        : undefined;
                      return (
                        <li key={opportunity.id}>
                          <button
                            type="button"
                            onClick={() => openOpportunity(opportunity.id)}
                            className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-primary)]/30"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">
                                {opportunity.title.replace(/^Opportunity:\s*/, "")}
                              </p>
                              <p className="truncate bee-micro">
                                {company?.name ?? "Sin empresa"} ·{" "}
                                {Math.round(qualificationScore(opportunity.qualification) * 100)}%
                                calificada
                              </p>
                            </div>
                            <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-chart-1)]/20 px-2 py-0.5 text-[11px] font-medium text-[var(--color-chart-1)]">
                              {RISK_LABEL[reason]}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}
        </TabsContent>

        <TabsContent value="simulador" className="mt-6">
          <ScenarioSimulatorPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
