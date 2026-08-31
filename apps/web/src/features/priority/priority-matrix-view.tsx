"use client";

import { Settings2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PriorityMatrixChart } from "@/components/priority/priority-matrix-chart";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IcpSettingsForm } from "@/features/priority/icp-settings-form";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useIcpCriteria } from "@/hooks/queries/use-icp";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import {
  computePriorities,
  isIcpConfigured,
  QUADRANT_HINTS,
  QUADRANT_LABELS,
  type PriorityQuadrant,
} from "@/lib/icp";

const QUADRANT_ORDER: PriorityQuadrant[] = ["priority", "nurture", "opportunistic", "deprioritize"];

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

/** Fit × Intención — qué cuentas encajan con tu cliente ideal Y están
 *  mostrando interés real ahora mismo, en vez de tratar toda señal caliente
 *  igual sin importar si es la cuenta correcta. */
export function PriorityMatrixView() {
  const { data: icpResult, isLoading: icpLoading } = useIcpCriteria();
  const { data: companiesResult, isLoading: companiesLoading } = useCompanies(300);
  const { data: oppsResult, isLoading: oppsLoading } = useOpportunities(undefined, 300);
  const { data: leadsResult, isLoading: leadsLoading } = useLeads(300);
  const { data: signalsResult, isLoading: signalsLoading } = useSignals(300);
  const [editingIcp, setEditingIcp] = useState(false);

  const criteria = icpResult?.data ?? { industries: [], sizes: [], countries: [] };
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
  };

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Inteligencia</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">Priorización</h1>
            <p className="bee-caption mt-1">
              Qué cuentas encajan con tu cliente ideal y están mostrando interés real ahora mismo
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={live ? "success" : "warning"}>{live ? "En vivo" : "Datos demo"}</Badge>
            <button
              type="button"
              onClick={() => setEditingIcp((v) => !v)}
              className="bee-btn-ghost inline-flex items-center gap-1.5 text-xs"
            >
              <Settings2 className="size-3.5" />
              {configured ? "Editar ICP" : "Configurar ICP"}
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
              <p className="text-sm font-medium">Todavía no configuraste tu Perfil de Cliente Ideal</p>
              <p className="bee-caption mx-auto mt-1 max-w-md">
                Sin eso no podemos calcular qué tan buen fit es cada cuenta — solo tendríamos el score de
                intención, que ya ves en Leads y Oportunidades. Defínelo para ver la matriz completa.
              </p>
              <button
                type="button"
                onClick={() => setEditingIcp(true)}
                className="bee-btn bee-btn--primary mt-4 text-xs"
              >
                Configurar ahora
              </button>
            </div>
          ) : companies.length === 0 ? (
            <div className="bee-bento bee-bento-pad py-12 text-center">
              <p className="text-sm text-muted-foreground">Todavía no hay empresas para priorizar.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {QUADRANT_ORDER.map((q) => (
                  <div key={q} className="bee-bento bee-bento-pad">
                    <p className="bee-kpi-tile__label">{QUADRANT_LABELS[q]}</p>
                    <p className="bee-kpi mt-2">{byQuadrant[q].length}</p>
                  </div>
                ))}
              </div>

              <section className="bee-surface bee-bento-pad">
                <h3 className="bee-card-title">Matriz de priorización</h3>
                <p className="bee-caption mb-4">Encaje con tu ICP × qué tan caliente está la señal</p>
                <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start">
                  <PriorityMatrixChart priorities={priorities} />
                  <p className="bee-caption max-w-xs">
                    Cada punto es una empresa. Arriba a la derecha: encaja con tu ICP y está caliente ahora — ahí
                    debería ir tu tiempo primero. Haz clic en un punto para abrir esa empresa.
                  </p>
                </div>
              </section>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {QUADRANT_ORDER.map((q) => (
                  <div key={q} className="flex flex-col">
                    <div className="mb-2 px-1">
                      <h3 className="bee-eyebrow">{QUADRANT_LABELS[q]}</h3>
                      <p className="mt-0.5 bee-micro">{QUADRANT_HINTS[q]}</p>
                    </div>
                    <div className="flex min-h-[100px] flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--color-primary)]/20 p-2.5">
                      {byQuadrant[q].length === 0 ? (
                        <p className="px-2 py-6 text-center bee-micro">Vacío</p>
                      ) : (
                        byQuadrant[q].map((p) => (
                          <Link
                            key={p.company.id}
                            href={`/dashboard/companies/${p.company.id}`}
                            className="bee-kanban-card block"
                          >
                            <p className="truncate text-sm font-medium">{p.company.name}</p>
                            <p className="mt-1 bee-micro">
                              Fit {p.fit} · Intención {Math.round(p.intent)}
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
