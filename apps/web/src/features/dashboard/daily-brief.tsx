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
import { useDashboardBase } from "@/lib/demo/mode";

const TONE_ICON: Record<BriefTone, LucideIcon> = {
  hot: Flame,
  risk: AlertTriangle,
  info: Info,
};

/* Brief cards are the one place on Resumen that carries a fill: each
   severity gets its BEE tone mixed toward white, border in the pure hue,
   so hot/risk/info read at a glance and text stays on a light ground. */
const TONE_FILL: Record<BriefTone, React.CSSProperties> = {
  hot: { background: "color-mix(in srgb, var(--color-chart-5) 22%, var(--color-card))", borderColor: "var(--color-chart-5)" },
  risk: { background: "color-mix(in srgb, var(--color-accent-warm) 32%, var(--color-card))", borderColor: "var(--color-chart-1)" },
  info: { background: "color-mix(in srgb, var(--color-chart-4) 22%, var(--color-card))", borderColor: "var(--color-chart-4)" },
};

/* Embedded on Resumen the brief is a list in one color (the box's indigo);
   the icon — flame, warning, info — says what kind of item it is. The
   severity tones below are for the standalone strip only. */
const TONE_RING: Record<BriefTone, string> = {
  hot: "color-mix(in srgb, var(--color-chart-5) 18%, var(--color-card))",
  risk: "color-mix(in srgb, var(--color-chart-1) 26%, var(--color-card))",
  info: "color-mix(in srgb, var(--color-chart-4) 20%, var(--color-card))",
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
/** `embedded`: rendered inside an OverviewCard (which owns the title), as a
 *  single column of compact rows — icon disc, title, one line of detail. */
export function DailyBrief({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTranslations("dashboardOverview.dailyBrief");
  const tItems = useTranslations("dashboardOverview.dailyBrief.items");
  const base = useDashboardBase();
  // The sandbox has no Team page (quotas live there on the real dashboard);
  // its quota-pace item points at Pronóstico instead of a 404.
  const resolveHref = (href: string) =>
    base === "/probar" && href.startsWith("/dashboard/team") ? "/probar/forecast" : href.replace(/^\/dashboard/, base);
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
  }, tItems);

  if (embedded) {
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
      <ul className="flex flex-col gap-1">
        {items.slice(0, 5).map((item) => {
          const Icon = TONE_ICON[item.tone];
          return (
            <li key={item.id}>
              <Link
                href={resolveHref(item.href)}
                className="flex items-start gap-3 rounded-[var(--radius-md)] px-2 py-2 transition-colors hover:bg-[var(--color-primary)]/30"
              >
                <span
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: TONE_RING.info, color: TONE_COLOR.info }}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="mt-0.5 block line-clamp-1 bee-micro">{item.description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-3.5 text-[var(--color-chart-4)]" />
        <p className="bee-eyebrow">{t("title")}</p>
      </div>
      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[70px] w-64 shrink-0 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bee-glass rounded-[var(--radius-lg)] px-4 py-3">
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          {items.map((item) => {
            const Icon = TONE_ICON[item.tone];
            return (
              <Link
                key={item.id}
                href={resolveHref(item.href)}
                className="bee-bento flex w-64 shrink-0 items-start gap-4 px-4 py-3 transition-opacity hover:opacity-90"
                style={TONE_FILL[item.tone]}
              >
                <Icon className="mt-1 size-4 shrink-0" style={{ color: TONE_COLOR[item.tone] }} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{item.title}</p>
                  <p className="mt-1 line-clamp-2 bee-micro">{item.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
