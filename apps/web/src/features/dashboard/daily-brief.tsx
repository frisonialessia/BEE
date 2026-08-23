"use client";

import { AlertTriangle, Flame, Info, Sparkles } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { useCompanies, useCompanyDuplicates } from "@/hooks/queries/use-companies";
import { useLeadDuplicates, useLeads } from "@/hooks/queries/use-leads";
import { useIcpCriteria } from "@/hooks/queries/use-icp";
import { useOpenAnomalies } from "@/hooks/queries/use-anomalies";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useQuotas } from "@/hooks/queries/use-quotas";
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
  const { data: companiesResult } = useCompanies(300);
  const { data: oppsResult } = useOpportunities(undefined, 300);
  const { data: leadsResult } = useLeads(300);
  const { data: icpResult } = useIcpCriteria();
  const { data: quotasResult } = useQuotas();
  const { data: users } = useUsers();
  const { data: companyDupResult } = useCompanyDuplicates();
  const { data: leadDupResult } = useLeadDuplicates();
  const { data: anomaliesResult } = useOpenAnomalies();

  const items = computeDailyBrief({
    today: new Date(),
    companies: companiesResult?.data ?? [],
    opportunities: oppsResult?.data ?? [],
    leads: leadsResult?.data ?? [],
    icpCriteria: icpResult?.data ?? { industries: [], sizes: [], countries: [] },
    quotas: quotasResult?.data ?? [],
    users: users ?? [],
    companyDuplicates: companyDupResult?.data ?? [],
    leadDuplicates: leadDupResult?.data ?? [],
    anomalies: anomaliesResult?.data ?? [],
  });

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-[var(--color-chart-4)]" />
        <p className="bee-eyebrow">Brief del día</p>
      </div>
      {items.length === 0 ? (
        <div className="bee-glass rounded-[var(--radius-lg)] px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Nada urgente por ahora — pipeline, cuotas y datos se ven en orden.
          </p>
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
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
