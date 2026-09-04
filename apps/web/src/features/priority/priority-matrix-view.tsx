"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { REST, TONE, tint } from "@/components/charts/palette";
import { CardLink, OverviewCard } from "@/components/dashboard/overview-card";
import { PriorityMatrixChart, QUADRANT_COLOR } from "@/components/priority/priority-matrix-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { IcpSettingsForm } from "@/features/priority/icp-settings-form";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useIcpCriteria } from "@/hooks/queries/use-icp";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { EMPTY_ICP_CRITERIA } from "@/lib/api/organizations";
import { useDashboardBase } from "@/lib/demo/mode";
import { computePriorities, isIcpConfigured, type CompanyPriority, type PriorityQuadrant } from "@/lib/icp";

/* The legend mirrors the plot: top-left hot-but-no-fit, top-right the one
   to work first, bottom-left neither, bottom-right fit-but-cold. */
const TILE_ORDER: PriorityQuadrant[] = ["opportunistic", "priority", "deprioritize", "nurture"];

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

/**
 * Priorización — fit × intención: which accounts match the ICP AND are
 * showing real interest now. One box for the matrix (magenta, one hue,
 * three intensities), one for the accounts of the selected quadrant, with
 * the four counts as the legend that filters it. The ICP form opens as a
 * box above the grid, in the "Nueva reunión" language.
 */
export function PriorityMatrixView() {
  const t = useTranslations("opportunitiesPriority.priority");
  const tForm = useTranslations("opportunitiesPriority.icpForm");
  const base = useDashboardBase();
  const { data: icpResult, isLoading: icpLoading } = useIcpCriteria();
  const { data: companiesResult, isLoading: companiesLoading } = useCompanies(300);
  const { data: oppsResult, isLoading: oppsLoading } = useOpportunities(undefined, 700);
  const { data: leadsResult, isLoading: leadsLoading } = useLeads(300);
  const { data: signalsResult, isLoading: signalsLoading } = useSignals(300);
  const [editingIcp, setEditingIcp] = useState(false);
  const [selected, setSelected] = useState<PriorityQuadrant>("priority");

  const criteria = icpResult?.data ?? EMPTY_ICP_CRITERIA;
  const companies = companiesResult?.data ?? [];
  const opportunities = oppsResult?.data ?? [];
  const leads = leadsResult?.data ?? [];
  const signals = signalsResult?.data ?? [];

  const loading = icpLoading || companiesLoading || oppsLoading || leadsLoading || signalsLoading;
  const configured = isIcpConfigured(criteria);

  const priorities = configured ? computePriorities(companies, criteria, { opportunities, leads, signals }) : [];

  const byQuadrant: Record<PriorityQuadrant, CompanyPriority[]> = { priority: [], nurture: [], opportunistic: [], deprioritize: [] };
  for (const p of priorities) byQuadrant[p.quadrant].push(p);
  for (const q of TILE_ORDER) byQuadrant[q].sort((a, b) => b.intent - a.intent || b.fit - a.fit);
  const rows = byQuadrant[selected];

  const suggestions = {
    industries: uniqueSorted(companies.map((c) => c.industry)),
    sizes: uniqueSorted(companies.map((c) => c.size)),
    countries: uniqueSorted(companies.map((c) => c.country)),
    revenueRanges: uniqueSorted(companies.map((c) => c.revenue_range)),
    seniorities: uniqueSorted(leads.map((l) => l.seniority)),
  };

  if (loading) {
    return (
      <div className="bee-overview">
        <Skeleton className="h-96 rounded-[var(--radius-lg)]" style={{ gridColumn: "span 7" }} />
        <Skeleton className="h-96 rounded-[var(--radius-lg)]" style={{ gridColumn: "span 5" }} />
      </div>
    );
  }

  const editAction = <CardLink onClick={() => setEditingIcp((v) => !v)}>{configured ? t("editIcp") : t("configureIcp")}</CardLink>;

  return (
    <div className="bee-overview">
      {editingIcp && (
        <OverviewCard span={12} title={tForm("title")} caption={tForm("subtitle")} className="lg:min-h-0!">
          <IcpSettingsForm initial={criteria} suggestions={suggestions} onDone={() => setEditingIcp(false)} />
        </OverviewCard>
      )}

      {!configured ? (
        <OverviewCard span={12} title={t("emptyIcp.title")} caption={t("matrixSection.subtitle")} className="lg:min-h-0!">
          <p className="bee-caption max-w-xl">{t("emptyIcp.subtitle")}</p>
          {!editingIcp && (
            <button type="button" onClick={() => setEditingIcp(true)} className="bee-btn bee-btn--primary mt-4 w-fit">
              {t("emptyIcp.cta")}
            </button>
          )}
        </OverviewCard>
      ) : companies.length === 0 ? (
        <OverviewCard span={12} title={t("matrixSection.title")} caption={t("matrixSection.subtitle")} action={editAction} className="lg:min-h-0!">
          <p className="bee-caption">{t("emptyCompanies")}</p>
        </OverviewCard>
      ) : (
        <>
          <OverviewCard span={7} title={t("matrixSection.title")} caption={t("matrixSection.subtitle")} action={editAction} className="lg:min-h-[28rem]!">
            <PriorityMatrixChart priorities={priorities} selected={selected} onSelectQuadrant={setSelected} />
          </OverviewCard>

          <OverviewCard span={5} title={t(`quadrants.${selected}.label`)} caption={t(`quadrants.${selected}.hint`)} className="lg:min-h-[28rem]!">
            {/* The legend: four counts, a dot in each quadrant's intensity; pressed = the list below. */}
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("legend.aria")}>
              {TILE_ORDER.map((q) => {
                const pressed = q === selected;
                return (
                  <button
                    key={q}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setSelected(q)}
                    className="flex! w-full min-w-0 items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-left transition-colors hover:bg-[var(--color-background)]"
                    style={{ borderColor: pressed ? "var(--color-text)" : "var(--color-divider)" }}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: QUADRANT_COLOR[q], boxShadow: q === "deprioritize" ? "inset 0 0 0 1px var(--color-divider)" : undefined }}
                    />
                    <span className="bee-caption min-w-0 flex-1 truncate">{t(`quadrants.${q}.label`)}</span>
                    <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">{byQuadrant[q].length}</span>
                  </button>
                );
              })}
            </div>

            {rows.length === 0 ? (
              <p className="bee-caption mt-4">{t("emptyQuadrant")}</p>
            ) : (
              <ul className="bee-fill mt-3 overflow-y-auto">
                {rows.map((p) => (
                  <li key={p.company.id} className="bee-row">
                    <Link href={`${base}/companies/${p.company.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.company.name}</span>
                        <span className="block bee-micro">{t("fitIntent", { fit: p.fit, intent: Math.round(p.intent) })}</span>
                      </span>
                      {/* Two thin bars — fit above, intent below — the row's place on the matrix. */}
                      <span className="flex w-16 shrink-0 flex-col gap-1" aria-hidden>
                        <span className="h-1.5 w-full rounded-full" style={{ background: REST }}>
                          <span className="block h-1.5 rounded-full" style={{ width: `${p.fit}%`, background: tint(TONE.urgency, 45) }} />
                        </span>
                        <span className="h-1.5 w-full rounded-full" style={{ background: REST }}>
                          <span className="block h-1.5 rounded-full" style={{ width: `${Math.round(p.intent)}%`, background: TONE.urgency }} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="bee-micro mt-3">{t("howTo.axes")}</p>
          </OverviewCard>
        </>
      )}
    </div>
  );
}
