"use client";

import { useLocale, useTranslations } from "next-intl";

import { CompetitorBreakdown } from "@/components/win-loss/competitor-breakdown";
import { LossReasonChart } from "@/components/win-loss/loss-reason-chart";
import { MeddicCorrelationChart } from "@/components/win-loss/meddic-correlation-chart";
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
      <header className={showHeader ? "mb-4" : "mb-4"}>
        {showHeader && <p className="bee-eyebrow">{t("eyebrow")}</p>}
        <div className={`flex flex-wrap items-start justify-between gap-3 ${showHeader ? "mt-1" : ""}`}>
          {showHeader && (
            <div>
              <h1 className="bee-display">{t("winLoss.title")}</h1>
              <p className="bee-caption mt-1">{t("winLoss.subtitle")}</p>
            </div>
          )}
          {showHeader && (
            <Badge className="ml-auto" variant={live ? "success" : "warning"}>
              {live ? t("liveBadge") : t("demoBadge")}
            </Badge>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-56" />
        </div>
      ) : summary.totalClosed === 0 ? (
        <div className="bee-bento bee-bento-pad py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("winLoss.emptyState.title")}</p>
          <p className="bee-caption mt-1">{t("winLoss.emptyState.subtitle")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Misma tarjeta compacta que Dark Funnel — ver forecast-view.tsx's
           * propio comentario, mismo cambio acá. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="bee-bento p-4 text-center">
              <p className="bee-stat__val">
                {summary.winRate !== null ? `${Math.round(summary.winRate * 100)}%` : "—"}
              </p>
              <p className="bee-stat__lbl mt-1">{t("winLoss.kpis.winRate.label")}</p>
            </div>
            <div className="bee-bento p-4 text-center">
              <p className="bee-stat__val">{formatCurrencyUSD(summary.wonValue, locale)}</p>
              <p className="bee-stat__lbl mt-1">{t("winLoss.kpis.wonValue.label")}</p>
            </div>
            <div className="bee-bento p-4 text-center">
              <p className="bee-stat__val">{formatCurrencyUSD(summary.lostValue, locale)}</p>
              <p className="bee-stat__lbl mt-1">{t("winLoss.kpis.lostValue.label")}</p>
            </div>
            <div className="bee-bento p-4 text-center">
              <p className="bee-stat__val">
                {summary.avgDaysToCloseWon !== null ? `${Math.round(summary.avgDaysToCloseWon)}d` : "—"}
              </p>
              <p className="bee-stat__lbl mt-1">{t("winLoss.kpis.daysToClose.label")}</p>
            </div>
          </div>

          {/* items-start: Razones de pérdida y Competidores are variable-length
              lists (one row per reason/competitor), not proportional charts —
              without this the grid's default stretch forces the shorter list's
              card to the taller one's height, leaving blank space below its
              last row instead of just being its own natural height (same fix
              already applied to the two Resumen heatmaps below). */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
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
