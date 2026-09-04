"use client";

import { useLocale, useTranslations } from "next-intl";

import { SignalCard } from "@/components/signal-card";
import { SignalVolumeChart } from "@/components/signals/signal-volume-chart";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { PriorityMatrixView } from "@/features/priority/priority-matrix-view";
import { usePagination } from "@/hooks/use-pagination";
import { useSignals } from "@/hooks/queries/use-signals";
import type { Locale } from "@/i18n/locales";
import { computeDailySignalVolume } from "@/lib/signal-trends";
import { LiveBadge } from "@/components/live-badge";
import { Donut } from "@/components/charts/donut";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { getSignalTypeLabels } from "@/lib/format";

/** Panel de señales — triggers de mercado del Signal Engine — con
 *  Priorización (fit × intención) como segunda pestaña: Priorización se
 *  deriva de estas mismas señales, antes dos filas del sidebar (ver
 *  lib/nav-items.ts). /dashboard/priority sigue existiendo como redirect
 *  a ?tab=priority. */
export function SignalsDashboard() {
  const locale = useLocale() as Locale;
  const t = useTranslations("signalsStrategies.signals");
  const { data: result, isLoading, isError } = useSignals(200);

  const signals = result?.data ?? [];
  const live = result?.live ?? false;
  const hotCount = signals.filter((s) => s.score >= 75).length;
  const pagination = usePagination(signals);
  const dailyVolume = computeDailySignalVolume(signals, new Date(), 14, locale);
  const typeLabels = getSignalTypeLabels(locale);
  const mixByType = [...signals.reduce((m, s) => m.set(s.signal_type, (m.get(s.signal_type) ?? 0) + 1), new Map<string, number>()).entries()].map(
    ([type, value]) => ({ label: typeLabels[type as keyof typeof typeLabels] ?? type, value }),
  );

  return (
    <div>
      <MergedPageTabs
        header={
          <header>
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            <h1 className="bee-display mt-1">{t("title")}</h1>
            <p className="bee-caption mt-1">
              {t("subtitle")} · {t("totalCount", { count: signals.length })} · {t("hotCount", { count: hotCount })}
            </p>
          </header>
        }
        actions={<LiveBadge live={live} />}
        defaultValue="feed"
        tabs={[
          {
            value: "feed",
            label: t("outerTabs.feed"),
            content: isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-28" />
                ))}
              </div>
            ) : isError ? (
              <p className="text-sm text-destructive">{t("loadError")}</p>
            ) : signals.length === 0 ? (
              <div className="bee-bento bee-bento-pad py-8 text-center">
                <p className="text-sm text-muted-foreground">{t("emptyTitle")}</p>
                <p className="bee-caption mt-2">{t("emptySubtitle")}</p>
              </div>
            ) : (
              <>
                <div className="bee-overview mb-4">
                  <OverviewCard span={8} title={t("volumeTitle")} caption={t("volumeSubtitle")}>
                    <SignalVolumeChart points={dailyVolume} />
                  </OverviewCard>
                  <OverviewCard span={4} title={t("mixTitle")} caption={t("mixSubtitle")}>
                    <Donut slices={mixByType} otherLabel={locale === "es" ? "Otras" : "Other"} />
                  </OverviewCard>
                </div>

                {/* Columna apilada en mobile a propósito, no el patrón de caja
                 * con scroll horizontal que usa el Pipeline (crm-board.tsx) o
                 * las tarjetas cortas de /probar — cada SignalCard trae título +
                 * descripción + tags, texto largo que se lee peor recortado en
                 * una tarjeta angosta de scroll horizontal que apilado a lo
                 * ancho de la pantalla. */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {pagination.pageItems.map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>

                <PaginationBar
                  page={pagination.page}
                  pageSize={pagination.pageSize}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.totalItems}
                  onPageChange={pagination.goToPage}
                  onPageSizeChange={pagination.changePageSize}
                  itemLabel={t("itemLabel")}
                />
              </>
            ),
          },
          {
            value: "priority",
            label: t("outerTabs.priority"),
            content: <PriorityMatrixView showHeader={false} />,
          },
        ]}
      />
    </div>
  );
}
