"use client";

import { AlertTriangle, Flame, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { useRowCapacity } from "@/components/charts/use-row-capacity";
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
import { useMeetings } from "@/hooks/queries/use-meetings";
import { useSignals } from "@/hooks/queries/use-signals";
import { useUsers } from "@/hooks/queries/use-users";
import { computeDailyBrief, type BriefTone } from "@/lib/daily-brief";
import { useDashboardBase } from "@/lib/demo/mode";

const TONE_ICON: Record<BriefTone, LucideIcon> = {
  hot: Flame,
  risk: AlertTriangle,
  info: Info,
};

/** Brief del día — junta lo que ya calcula el resto de BEE (pronóstico,
 *  anomalías, priorización, cuotas, duplicados) en una sola fila de "esto
 *  necesita tu atención hoy", arriba del todo en Resumen. Si no hay nada
 *  real que decir, lo dice — nunca inventa urgencia para llenar el espacio. */
/** Rendered inside an OverviewCard (which owns the title), as a single
 *  column of compact rows — icon disc, title, one line of detail. */
export function DailyBrief() {
  const t = useTranslations("dashboardOverview.dailyBrief");
  const tItems = useTranslations("dashboardOverview.dailyBrief.items");
  const base = useDashboardBase();
  // The sandbox has no Team page (quotas live there on the real dashboard);
  // its quota-pace item points at Pronóstico instead of a 404.
  const resolveHref = (href: string) =>
    base === "/probar" && href.startsWith("/dashboard/team") ? "/probar/forecast" : href.replace(/^\/dashboard/, base);
  const { data: companiesResult, isLoading: companiesLoading } = useCompanies(300);
  const { data: oppsResult, isLoading: oppsLoading } = useOpportunities(undefined, 700);
  const { data: leadsResult, isLoading: leadsLoading } = useLeads(300);
  const { data: icpResult, isLoading: icpLoading } = useIcpCriteria();
  const { data: quotasResult, isLoading: quotasLoading } = useQuotas();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: companyDupResult, isLoading: companyDupLoading } = useCompanyDuplicates();
  const { data: leadDupResult, isLoading: leadDupLoading } = useLeadDuplicates();
  const { data: anomaliesResult, isLoading: anomaliesLoading } = useOpenAnomalies();
  const { data: overdueTasksResult, isLoading: overdueTasksLoading } = useOverdueTasks();
  const { data: patternsResult, isLoading: patternsLoading } = useSuccessPatterns();
  const { data: signalsResult } = useSignals(300);
  const { data: meetings } = useMeetings();
  // Row = py-2.5 (20) + text-sm line (20) + mt-0.5 (2) + caption line (16) + hairline 1 → 59.
  const [listRef, capacity] = useRowCapacity<HTMLUListElement>(59, 0, { min: 4, max: 12 });

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
    signals: signalsResult?.data ?? [],
    meetings: meetings ?? [],
  }, tItems);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-[var(--radius-lg)]" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="bee-caption py-8 text-center">{t("empty")}</p>;
  }
  return (
    <ul ref={listRef} className="bee-fill flex flex-col overflow-hidden">
      {items.slice(0, capacity).map((item) => {
        const Icon = TONE_ICON[item.tone];
        return (
          <li key={item.id}>
            <Link
              href={resolveHref(item.href)}
              className="bee-row items-start transition-colors hover:bg-[var(--color-background)]"
            >
              <span
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text)]"
                style={{ background: "var(--color-background)" }}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                {/* No `block` here: it would override line-clamp's -webkit-box and let the line wrap. */}
                <span className="mt-0.5 line-clamp-1 bee-caption">{item.description}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
