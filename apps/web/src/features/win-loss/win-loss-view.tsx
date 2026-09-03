"use client";

import { CalendarClock, DollarSign, Percent, Trophy } from "lucide-react";

import { useLocale, useTranslations } from "next-intl";

import { CompetitorBreakdown } from "@/components/win-loss/competitor-breakdown";
import { LossReasonChart } from "@/components/win-loss/loss-reason-chart";
import { MeddicCorrelationChart } from "@/components/win-loss/meddic-correlation-chart";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import type { Locale } from "@/i18n/locales";
import { formatCurrencyUSD } from "@/lib/i18n/format";
import { computeWinLoss } from "@/lib/win-loss";

/** Ganado/Perdido — por qué se ganan y se pierden los deals, no solo cuántos.
 *  Todo calculado en el cliente a partir de las oportunidades ya cargadas
 *  (mismo patrón que Pronóstico/Tendencias) — nada nuevo del lado del
 *  backend salvo los dos campos que el rep llena al cerrar un deal
 *  (razón de pérdida, competidor) desde el panel del drawer.
 *
 * `showHeader=false` when embedded as a tab of the merged Forecast page
 * (see forecast-view.tsx) — the live/demo badge stays regardless. */
export function WinLossView({ showHeader = true }: { showHeader?: boolean }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("forecastWinLoss");
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 300);

  const opportunities = oppsResult?.data ?? [];
  const live = oppsResult?.live ?? false;
  const summary = computeWinLoss(opportunities);

  return (
    <div>
      <header className={showHeader ? "mb-6" : "mb-4"}>
        {showHeader && <p className="bee-eyebrow">{t("eyebrow")}</p>}
        <div className={`flex flex-wrap items-start justify-between gap-3 ${showHeader ? "mt-1" : ""}`}>
          {showHeader && (
            <div>
              <h1 className="bee-display">{t("winLoss.title")}</h1>
              <p className="bee-caption mt-1">{t("winLoss.subtitle")}</p>
            </div>
          )}
          <Badge className="ml-auto" variant={live ? "success" : "warning"}>
            {live ? t("liveBadge") : t("demoBadge")}
          </Badge>
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
          <p className="text-sm text-muted-foreground">{t("winLoss.emptyState.title")}</p>
          <p className="bee-caption mt-1">{t("winLoss.emptyState.subtitle")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label={t("winLoss.kpis.winRate.label")}
              value={summary.winRate !== null ? `${Math.round(summary.winRate * 100)}%` : "—"}
              hint={t("winLoss.kpis.winRate.hint", { won: summary.won, total: summary.totalClosed })}
              icon={Percent}
            />
            <MetricCard
              label={t("winLoss.kpis.wonValue.label")}
              value={formatCurrencyUSD(summary.wonValue, locale)}
              hint={t("winLoss.kpis.wonValue.hint")}
              icon={Trophy}
            />
            <MetricCard
              label={t("winLoss.kpis.lostValue.label")}
              value={formatCurrencyUSD(summary.lostValue, locale)}
              hint={t("winLoss.kpis.lostValue.hint")}
              icon={DollarSign}
            />
            <MetricCard
              label={t("winLoss.kpis.daysToClose.label")}
              value={
                summary.avgDaysToCloseWon !== null ? `${Math.round(summary.avgDaysToCloseWon)}d` : "—"
              }
              hint={
                summary.avgDaysToCloseWon === null
                  ? summary.avgDaysToCloseLost !== null
                    ? t("winLoss.kpis.daysToClose.hintNoWonHasLost", {
                        days: Math.round(summary.avgDaysToCloseLost),
                      })
                    : t("winLoss.kpis.daysToClose.hintNoWonNoLost")
                  : summary.avgDaysToCloseLost !== null
                    ? t("winLoss.kpis.daysToClose.hintHasWonHasLost", {
                        days: Math.round(summary.avgDaysToCloseLost),
                      })
                    : t("winLoss.kpis.daysToClose.hintHasWonNoLost")
              }
              icon={CalendarClock}
            />
          </div>

          {/* items-start: Razones de pérdida y Competidores are variable-length
              lists (one row per reason/competitor), not proportional charts —
              without this the grid's default stretch forces the shorter list's
              card to the taller one's height, leaving blank space below its
              last row instead of just being its own natural height (same fix
              already applied to the two Resumen heatmaps below). */}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section className="bee-surface bee-bento-pad">
              <h3 className="bee-card-title">{t("winLoss.reasons.title")}</h3>
              <p className="bee-caption mb-4">{t("winLoss.reasons.caption")}</p>
              <LossReasonChart stats={summary.reasonBreakdown} />
            </section>

            <section className="bee-surface bee-bento-pad">
              <h3 className="bee-card-title">{t("winLoss.competitors.title")}</h3>
              <p className="bee-caption mb-4">{t("winLoss.competitors.caption")}</p>
              <CompetitorBreakdown stats={summary.competitorBreakdown} />
            </section>
          </div>

          <section className="bee-surface bee-bento-pad">
            <h3 className="bee-card-title">{t("winLoss.meddic.title")}</h3>
            <p className="bee-caption mb-4">{t("winLoss.meddic.caption")}</p>
            <MeddicCorrelationChart stats={summary.meddicCorrelation} />
          </section>
        </div>
      )}
    </div>
  );
}
