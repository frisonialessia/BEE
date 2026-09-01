"use client";

import { AlertTriangle, Flame, Info, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useCompanies, useCompanyDuplicates } from "@/hooks/queries/use-companies";
import { useLeadDuplicates, useLeads } from "@/hooks/queries/use-leads";
import { useIcpCriteria } from "@/hooks/queries/use-icp";
import { EMPTY_ICP_CRITERIA } from "@/lib/api/organizations";
import { useOpenAnomalies } from "@/hooks/queries/use-anomalies";
import { useSuccessPatterns } from "@/hooks/queries/use-feedback";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useQuotas } from "@/hooks/queries/use-quotas";
import { useOverdueTasks } from "@/hooks/queries/use-tasks";
import { useUsers } from "@/hooks/queries/use-users";
import { computeDailyBrief, type BriefTone } from "@/lib/daily-brief";

const TONE_ICON: Record<BriefTone, LucideIcon> = {
  hot: Flame,
  risk: AlertTriangle,
  info: Info,
};

const TONE_COLOR: Record<BriefTone, string> = {
  hot: "var(--color-chart-5)",
  risk: "var(--color-chart-1)",
  info: "var(--color-chart-4)",
};

/** Brief del día — junta lo que ya calcula el resto de BEE (pronóstico,
 *  anomalías, priorización, cuotas, duplicados) en una sola fila de "esto
 *  necesita tu atención hoy", arriba del todo en Resumen. Si no hay nada
 *  real que decir, lo dice — nunca inventa urgencia para llenar el espacio. */
export function DailyBrief() {
  const t = useTranslations("dashboardOverview.dailyBrief");
  const { data: companiesResult, isLoading: companiesLoading } = useCompanies(300);
  const { data: oppsResult, isLoading: oppsLoading } = useOpportunities(undefined, 300);
  const { data: leadsResult, isLoading: leadsLoading } = useLeads(300);
  const { data: icpResult, isLoading: icpLoading } = useIcpCriteria();
  const { data: quotasResult, isLoading: quotasLoading } = useQuotas();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: companyDupResult, isLoading: companyDupLoading } = useCompanyDuplicates();
  const { data: leadDupResult, isLoading: leadDupLoading } = useLeadDuplicates();
  const { data: anomaliesResult, isLoading: anomaliesLoading } = useOpenAnomalies();
  const { data: overdueTasksResult, isLoading: overdueTasksLoading } = useOverdueTasks();
  const { data: patternsResult, isLoading: patternsLoading } = useSuccessPatterns();

  // Este componente arma su propio set de queries (no comparte el gate de
  // loading de la página padre) — sin este chequeo, un usuario con conexión
  // lenta ve "Nada urgente por ahora" un instante antes de que los datos
  // reales lleguen, que es exactamente la clase de falsa calma que la
  // regla de honestidad de datos prohíbe en cualquier otra parte de BEE.
  const loading =
    companiesLoading ||
    oppsLoading ||
    leadsLoading ||
    icpLoading ||
    quotasLoading ||
    usersLoading ||
    companyDupLoading ||
    leadDupLoading ||
    anomaliesLoading ||
    overdueTasksLoading ||
    patternsLoading;

  const items = computeDailyBrief({
    today: new Date(),
    companies: companiesResult?.data ?? [],
    opportunities: oppsResult?.data ?? [],
    leads: leadsResult?.data ?? [],
    icpCriteria: icpResult?.data ?? EMPTY_ICP_CRITERIA,
    quotas: quotasResult?.data ?? [],
    users: users ?? [],
    companyDuplicates: companyDupResult?.data ?? [],
    leadDuplicates: leadDupResult?.data ?? [],
    anomalies: anomaliesResult?.data ?? [],
    overdueTasks: overdueTasksResult?.data ?? [],
    successPatterns: patternsResult?.data ?? [],
  });

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-[var(--color-chart-4)]" />
        <p className="bee-eyebrow">{t("title")}</p>
      </div>
      {loading ? (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[70px] w-64 shrink-0 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bee-glass rounded-[var(--radius-lg)] px-4 py-3">
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {items.map((item) => {
            const Icon = TONE_ICON[item.tone];
            return (
              <Link
                key={item.id}
                href={item.href}
                className="bee-glass bee-glass--hover flex w-64 shrink-0 items-start gap-2.5 rounded-[var(--radius-lg)] px-4 py-3"
              >
                <Icon className="mt-0.5 size-4 shrink-0" style={{ color: TONE_COLOR[item.tone] }} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 bee-micro">{item.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
