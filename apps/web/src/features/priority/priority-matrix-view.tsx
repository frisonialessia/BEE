"use client";

import { Settings2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { LiveBadge } from "@/components/live-badge";
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

const QUADRANT_ORDER: PriorityQuadrant[] = ["priority", "nurture", "opportunistic", "deprioritize"];

/* Tiles mirror the plot: top-left hot-but-no-fit, top-right the one to
   work first, bottom-left neither, bottom-right fit-but-cold. */
const TILE_ORDER: PriorityQuadrant[] = ["opportunistic", "priority", "deprioritize", "nurture"];

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

/** Fit × Intención — qué cuentas encajan con tu cliente ideal Y están
 *  mostrando interés real ahora mismo, en vez de tratar toda señal caliente
 *  igual sin importar si es la cuenta correcta.
 *
 *  Same shell as Ventas and Resumen: the 12-column .bee-overview grid and
 *  OverviewCard for every box. The matrix carries its quadrant names inside
 *  the plot and the box beside it says how to read the two axes, so
 *  "Prioridad máxima" is explained where it is drawn. Counts live in the
 *  four tiles at the standard type size — no oversized figures.
 *
 * `showHeader=false` when embedded as a tab of the merged Signals page
 * (see signals-dashboard.tsx) — the live/demo badge and "Edit ICP" button
 * stay either way, those are real actions. */
export function PriorityMatrixView({ showHeader = true }: { showHeader?: boolean }) {
  const t = useTranslations("opportunitiesPriority.priority");
  const base = useDashboardBase();
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

  const priorities = configured ? computePriorities(companies, criteria, { opportunities, leads, signals }) : [];

  const byQuadrant: Record<PriorityQuadrant, CompanyPriority[]> = {
    priority: [],
    nurture: [],
    opportunistic: [],
    deprioritize: [],
  };
  for (const p of priorities) byQuadrant[p.quadrant].push(p);
  for (const q of QUADRANT_ORDER) byQuadrant[q].sort((a, b) => b.intent - a.intent || b.fit - a.fit);

  const filled = QUADRANT_ORDER.filter((q) => byQuadrant[q].length > 0);
  const empty = QUADRANT_ORDER.filter((q) => byQuadrant[q].length === 0);
  const listSpan = ({ 1: 12, 2: 6, 3: 4, 4: 3 } as const)[Math.min(4, Math.max(1, filled.length)) as 1 | 2 | 3 | 4];

  const suggestions = {
    industries: uniqueSorted(companies.map((c) => c.industry)),
    sizes: uniqueSorted(companies.map((c) => c.size)),
    countries: uniqueSorted(companies.map((c) => c.country)),
    revenueRanges: uniqueSorted(companies.map((c) => c.revenue_range)),
    seniorities: uniqueSorted(leads.map((l) => l.seniority)),
  };

  return (
    <div>
      <header className="mb-4">
        {showHeader && <p className="bee-eyebrow">{t("eyebrow")}</p>}
        <div className={`flex flex-wrap items-start justify-between gap-4 ${showHeader ? "mt-1" : ""}`}>
          {showHeader && (
            <div>
              <h1 className="bee-display">{t("title")}</h1>
              <p className="bee-caption mt-1">{t("subtitle")}</p>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {showHeader && <LiveBadge live={live} />}
            <button type="button" onClick={() => setEditingIcp((v) => !v)} className="bee-btn-ghost inline-flex items-center gap-2 text-xs">
              <Settings2 className="size-3.5" />
              {configured ? t("editIcp") : t("configureIcp")}
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="space-y-4">
          {editingIcp && <IcpSettingsForm initial={criteria} suggestions={suggestions} onDone={() => setEditingIcp(false)} />}

          {!configured ? (
            <div className="bee-bento bee-bento-pad py-8 text-center">
              <p className="text-sm font-medium">{t("emptyIcp.title")}</p>
              <p className="bee-caption mx-auto mt-1 max-w-md">{t("emptyIcp.subtitle")}</p>
              <button type="button" onClick={() => setEditingIcp(true)} className="bee-btn bee-btn--primary mt-4 text-xs">
                {t("emptyIcp.cta")}
              </button>
            </div>
          ) : companies.length === 0 ? (
            <div className="bee-bento bee-bento-pad py-8 text-center">
              <p className="text-sm text-muted-foreground">{t("emptyCompanies")}</p>
            </div>
          ) : (
            <div className="bee-overview">
              {/* Row 1 — the matrix and how to read it, one row, same height. */}
              <OverviewCard span={7} title={t("matrixSection.title")} caption={t("matrixSection.subtitle")} className="lg:min-h-[22rem]">
                <PriorityMatrixChart priorities={priorities} />
              </OverviewCard>

              <OverviewCard span={5} title={t("howTo.title")} caption={t("howTo.caption")}>
                <div className="bee-fill grid grid-cols-2 auto-rows-fr gap-2">
                  {TILE_ORDER.map((q) => (
                    <div key={q} className="flex flex-col rounded-[var(--radius-md)] px-3 py-2.5" style={{ background: mix(QUADRANT_COLOR[q], q === "deprioritize" ? 10 : 16) }}>
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: QUADRANT_COLOR[q] }} />
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{t(`quadrants.${q}.label`)}</p>
                        <span className="text-sm font-bold tabular-nums">{byQuadrant[q].length}</span>
                      </div>
                      <p className="mt-1 line-clamp-3 bee-micro">{t(`quadrants.${q}.hint`)}</p>
                    </div>
                  ))}
                </div>
                <p className="bee-micro mt-3">{t("howTo.axes")}</p>
              </OverviewCard>

              {/* Row 2 — one list per zone that has accounts, widest when few. */}
              {filled.map((q) => (
                <OverviewCard
                  key={q}
                  span={listSpan}
                  title={t(`quadrants.${q}.label`)}
                  caption={t("lists.caption", { count: byQuadrant[q].length })}
                  action={<span className="size-2.5 rounded-full" style={{ background: QUADRANT_COLOR[q] }} aria-hidden />}
                >
                  <ul className="flex max-h-[26rem] flex-col gap-1 overflow-y-auto">
                    {byQuadrant[q].map((p) => (
                      <li key={p.company.id}>
                        <Link
                          href={`${base}/companies/${p.company.id}`}
                          className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 transition-colors hover:bg-[var(--color-primary)]/30"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{p.company.name}</span>
                            <span className="block bee-micro">{t("fitIntent", { fit: p.fit, intent: Math.round(p.intent) })}</span>
                          </span>
                          {/* Two thin bars: fit on top, intent below — the row's
                              place on the matrix without reading the numbers. */}
                          <span className="flex w-16 shrink-0 flex-col gap-1" aria-hidden>
                            <span className="h-1.5 w-full rounded-full" style={{ background: mix(QUADRANT_COLOR[q], 18) }}>
                              <span className="block h-1.5 rounded-full" style={{ width: `${p.fit}%`, background: QUADRANT_COLOR[q], opacity: 0.55 }} />
                            </span>
                            <span className="h-1.5 w-full rounded-full" style={{ background: mix(QUADRANT_COLOR[q], 18) }}>
                              <span className="block h-1.5 rounded-full" style={{ width: `${Math.round(p.intent)}%`, background: QUADRANT_COLOR[q] }} />
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </OverviewCard>
              ))}

              {empty.length > 0 && (
                <p className="bee-caption" style={{ gridColumn: "span 12" }}>
                  {t("emptyQuadrantsLine", { quadrants: empty.map((q) => t(`quadrants.${q}.label`)).join(" · ") })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
