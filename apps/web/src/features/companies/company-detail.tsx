"use client";

import { ArrowUpRight, Building2, Globe, Mail, Radio, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useCompany } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { opportunityStatusLabels } from "@/lib/format";

/** Ficha de empresa — contactos, oportunidades y señales, todo junto. */
export function CompanyDetail({ companyId }: { companyId: string }) {
  const { data: companyResult, isLoading } = useCompany(companyId);
  const { data: leadsResult } = useLeads(200);
  const { data: oppsResult } = useOpportunities(undefined, 200);
  const { data: signalsResult } = useSignals(200);
  const { openOpportunity } = useOpportunityDrawer();

  const company = companyResult?.data;
  const leads = (leadsResult?.data ?? []).filter((l) => l.company_id === companyId);
  const opportunities = (oppsResult?.data ?? []).filter((o) => o.company_id === companyId);
  const signals = (signalsResult?.data ?? []).filter((s) => s.company_id === companyId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="bee-bento bee-bento-pad py-12 text-center">
        <p className="text-sm text-muted-foreground">No se encontró esta empresa.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]">
            <Building2 className="size-5 text-[var(--color-chart-4)]" />
          </span>
          <div>
            <h1 className="bee-display">{company.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {company.domain && (
                <span className="flex items-center gap-1">
                  <Globe className="size-3" />
                  {company.domain}
                </span>
              )}
              {company.industry && <span>{company.industry}</span>}
              {company.country && <span>{company.country}</span>}
              {company.size && <span>{company.size} empleados</span>}
            </div>
          </div>
        </div>
        {company.website && (
          <a
            href={company.website}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-chart-4)] hover:underline"
          >
            Sitio web
            <ArrowUpRight className="size-3" />
          </a>
        )}
      </header>

      {company.description && <p className="text-sm text-muted-foreground">{company.description}</p>}

      <div className="bee-kpi-strip !mt-0">
        <div className="bee-kpi-tile">
          <p className="bee-kpi-tile__label">Contactos</p>
          <p className="bee-kpi-tile__value">{leads.length}</p>
        </div>
        <div className="bee-kpi-tile">
          <p className="bee-kpi-tile__label">Oportunidades</p>
          <p className="bee-kpi-tile__value">{opportunities.length}</p>
        </div>
        <div className="bee-kpi-tile">
          <p className="bee-kpi-tile__label">Señales</p>
          <p className="bee-kpi-tile__value">{signals.length}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Mail className="size-4 text-muted-foreground" />
          Contactos ({leads.length})
        </h2>
        {leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin contactos registrados todavía.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {leads.map((lead) => (
              <div key={lead.id} className="bee-bento bee-bento-pad">
                <p className="text-sm font-medium">{lead.full_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[lead.title, lead.seniority].filter(Boolean).join(" · ") || "Sin cargo registrado"}
                </p>
                {lead.email && <p className="mt-1 text-xs text-muted-foreground">{lead.email}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Target className="size-4 text-muted-foreground" />
          Oportunidades ({opportunities.length})
        </h2>
        {opportunities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin oportunidades para esta empresa todavía.</p>
        ) : (
          <div className="space-y-2">
            {opportunities.map((opp) => (
              <button
                key={opp.id}
                type="button"
                onClick={() => openOpportunity(opp.id)}
                className="bee-bento bee-bento-pad flex w-full items-center justify-between gap-3 text-left transition-colors hover:border-[var(--color-chart-4)]"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {opp.title.replace(/^Opportunity:\s*/, "")}
                </span>
                <Badge variant="secondary" className="shrink-0">
                  {opportunityStatusLabels[opp.status]}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Radio className="size-4 text-muted-foreground" />
          Señales ({signals.length})
        </h2>
        {signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin señales para esta empresa todavía.</p>
        ) : (
          <div className="space-y-2">
            {signals.map((signal) => (
              <div key={signal.id} className="bee-bento bee-bento-pad">
                <p className="text-sm font-medium">{signal.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Score {Math.round(signal.score)} · {new Date(signal.detected_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
