"use client";

import { Settings2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PriorityMatrixChart, QUADRANT_COLOR } from "@/components/priority/priority-matrix-chart";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IcpSettingsForm } from "@/features/priority/icp-settings-form";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useIcpCriteria } from "@/hooks/queries/use-icp";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { EMPTY_ICP_CRITERIA } from "@/lib/api/organizations";
import { computePriorities, isIcpConfigured, type PriorityQuadrant } from "@/lib/icp";

const QUADRANT_ORDER: PriorityQuadrant[] = ["priority", "nurture", "opportunistic", "deprioritize"];

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

/** Fit × Intención — qué cuentas encajan con tu cliente ideal Y están
 *  mostrando interés real ahora mismo, en vez de tratar toda señal caliente
 *  igual sin importar si es la cuenta correcta. */
export function PriorityMatrixView() {
  const t = useTranslations("opportunitiesPriority.priority");
  const { data: icpResult, isLoading: icpLoading } = useIcpCriteria();
  const { data: companiesResult, isLoading: companiesLoading } = useCompanies(300);
  const { data: oppsResult, isLoading: oppsLoading } = useOpportunities(undefined, 300);
  const { data: leadsResult, isLoading: leadsLoading } = useLeads(300);
  const { data: signalsResult, isLoading: signalsLoading } = useSignals(300);
  const [editingIcp, setEditingIcp] = useState(false);

  const criteria = icpResult?.data ?? EMPTY_ICP_CRITERIA;
  const companies = companiesResult?.data ?? [];
  const opportunities = oppsResult?.data ?? [];
  const leads = leadsResult?.data ?? [];
  const signals = signalsResult?.data ?? [];
  const live = companiesResult?.live ?? false;

  const loading = icpLoading || companiesLoading || oppsLoading || leadsLoading || signalsLoading;
  const configured = isIcpConfigured(criteria);

  const priorities = configured
    ? computePriorities(companies, criteria, { opportunities, leads, signals })
    : [];

  const byQuadrant: Record<PriorityQuadrant, typeof priorities> = {
    priority: priorities.filter((p) => p.quadrant === "priority"),
    nurture: priorities.filter((p) => p.quadrant === "nurture"),
    opportunistic: priorities.filter((p) => p.quadrant === "opportunistic"),
    deprioritize: priorities.filter((p) => p.quadrant === "deprioritize"),
  };

  const suggestions = {
    industries: uniqueSorted(companies.map((c) => c.industry)),
    sizes: uniqueSorted(companies.map((c) => c.size)),
    countries: uniqueSorted(companies.map((c) => c.country)),
    revenueRanges: uniqueSorted(companies.map((c) => c.revenue_range)),
    seniorities: uniqueSorted(leads.map((l) => l.seniority)),
  };

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">{t("title")}</h1>
            <p className="bee-caption mt-1">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={live ? "success" : "warning"}>{live ? t("live") : t("demoData")}</Badge>
            <button
              type="button"
              onClick={() => setEditingIcp((v) => !v)}
              className="bee-btn-ghost inline-flex items-center gap-1.5 text-xs"
            >
              <Settings2 className="size-3.5" />
              {configured ? t("editIcp") : t("configureIcp")}
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="space-y-6">
          {editingIcp && (
            <IcpSettingsForm initial={criteria} suggestions={suggestions} onDone={() => setEditingIcp(false)} />
          )}

          {!configured ? (
            <div className="bee-bento bee-bento-pad py-12 text-center">
              <p className="text-sm font-medium">{t("emptyIcp.title")}</p>
              <p className="bee-caption mx-auto mt-1 max-w-md">{t("emptyIcp.subtitle")}</p>
              <button
                type="button"
                onClick={() => setEditingIcp(true)}
                className="bee-btn bee-btn--primary mt-4 text-xs"
              >
                {t("emptyIcp.cta")}
              </button>
            </div>
          ) : companies.length === 0 ? (
            <div className="bee-bento bee-bento-pad py-12 text-center">
              <p className="text-sm text-muted-foreground">{t("emptyCompanies")}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {QUADRANT_ORDER.map((q) => (
                  <div key={q} className="bee-bento bee-bento-pad">
                    <p className="bee-kpi-tile__label">{t(`quadrants.${q}.label`)}</p>
                    <p className="bee-kpi mt-2">{byQuadrant[q].length}</p>
                  </div>
                ))}
              </div>

              <section className="bee-surface bee-bento-pad">
                <h3 className="bee-card-title">{t("matrixSection.title")}</h3>
                <p className="bee-caption mb-4">{t("matrixSection.subtitle")}</p>
                {/* flex-1 on the legend (not the chart) — the chart keeps its
                 * fixed aspect ratio (an SVG plot doesn't get more readable
                 * by stretching), the legend is what grows to use whatever
                 * width the card actually has, on a wide desktop and on
                 * mobile alike. Doubles as the "what does each color mean"
                 * key the dots' hover-only tooltips don't provide. */}
                <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center">
                  <PriorityMatrixChart priorities={priorities} />
                  <div className="w-full flex-1 space-y-3">
                    <p className="bee-caption">{t("matrixSection.description")}</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {QUADRANT_ORDER.map((q) => (
                        <li
                          key={q}
                          className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-[var(--color-primary)]/15 p-2.5"
                        >
                          <span
                            className="mt-1 size-2.5 shrink-0 rounded-full"
                            style={{ background: QUADRANT_COLOR[q] }}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-medium">
                              {t(`quadrants.${q}.label`)} · {byQuadrant[q].length}
                            </p>
                            <p className="mt-0.5 bee-micro">{t(`quadrants.${q}.hint`)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              {/* items-start (not the grid default, stretch) + max-h +
                  overflow-y-auto on each column — same fix already applied
                  to CrmBoard's kanban columns: without it, a quadrant with
                  many companies stretches every sibling to match, so an
                  empty quadrant ends up padded with dead whitespace instead
                  of sitting at its own compact height. */}
              <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {QUADRANT_ORDER.map((q) => (
                  <div key={q} className="flex flex-col">
                    <div className="mb-2 px-1">
                      <h3 className="bee-eyebrow">{t(`quadrants.${q}.label`)}</h3>
                      <p className="mt-0.5 bee-micro">{t(`quadrants.${q}.hint`)}</p>
                    </div>
                    <div className="flex min-h-[100px] max-h-[65vh] flex-col gap-2 overflow-y-auto rounded-[var(--radius-lg)] bg-[var(--color-primary)]/20 p-2.5">
                      {byQuadrant[q].length === 0 ? (
                        <p className="px-2 py-6 text-center bee-micro">{t("emptyQuadrant")}</p>
                      ) : (
                        byQuadrant[q].map((p) => (
                          <Link
                            key={p.company.id}
                            href={`/dashboard/companies/${p.company.id}`}
                            className="bee-kanban-card block"
                          >
                            <p className="truncate text-sm font-medium">{p.company.name}</p>
                            <p className="mt-1 bee-micro">
                              {t("fitIntent", { fit: p.fit, intent: Math.round(p.intent) })}
                            </p>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
