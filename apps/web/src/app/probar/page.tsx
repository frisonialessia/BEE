"use client";

import { KanbanSquare, Radio } from "lucide-react";
import Link from "next/link";

import { IndustrySignalHeatmap } from "@/components/dashboard/industry-signal-heatmap";
import { PipelineFunnel } from "@/components/dashboard/pipeline-funnel";
import { SignalActivityHeatmap } from "@/components/dashboard/signal-activity-heatmap";
import { MetricCard } from "@/components/metric-card";
import { AddCompanyForm } from "@/features/probar/add-company-form";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { bucketByDay } from "@/lib/trend";

/** Landing page of the sandbox — a light overview (2 summary cards), plus
 * the same cross-cutting widgets the real Dashboard's "Resumen" shows
 * (embudo, heatmap industria × señal, heatmap de actividad) — nav calls
 * this page "Resumen" too, so a visitor exploring the sandbox should see
 * the same depth, not a stripped-down version. Counts/widgets go through
 * the same hooks the rest of the app uses (not lib/demo/store directly) —
 * TanStack Query's data starts undefined until mounted, matching the
 * server-rendered page (this route is statically prerendered, so there's
 * no localStorage at build time) instead of mismatching it, which a
 * `typeof window` check alone would risk doing on a returning visitor's
 * own browser. */
export default function ProbarOverviewPage() {
  const { data: opportunitiesResult } = useOpportunities();
  const { data: signalsResult } = useSignals();
  const { data: companiesResult } = useCompanies(200);
  const opportunities = opportunitiesResult?.data ?? [];
  const signals = signalsResult?.data ?? [];
  const opportunityCount = opportunities.length;
  const signalCount = signals.length;
  const signalsTrend = bucketByDay(signals.map((s) => s.detected_at), 7);
  const opportunitiesTrend = bucketByDay(opportunities.map((o) => o.created_at), 7);

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Sandbox</p>
        <h1 className="bee-display">Así ve BEE tu mercado</h1>
        <p className="bee-caption mt-1 max-w-2xl">
          Señales detectadas → pipeline priorizado → estrategia lista para ejecutar. Explora con
          los datos de ejemplo, o simula tu propia empresa para ver cómo BEE la procesaría.
        </p>
        <div className="mt-4">
          <AddCompanyForm />
        </div>
      </header>

      {/* Mismo tile de KPI que usa el Dashboard real (MetricCard) — no dos
       * pills chicas flotando con espacio de sobra alrededor. "CRM", no
       * "Pipeline": ese nombre ya es de otra sección (Pipeline oculto /
       * Dark Funnel) — usar la palabra suelta acá confundiría a cuál se
       * refiere el link. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/probar/signals" className="block">
          <MetricCard label="Señales" value={signalCount} hint="triggers de mercado detectados" icon={Radio} trend={signalsTrend} />
        </Link>
        <Link href="/probar/crm" className="block">
          <MetricCard label="CRM" value={opportunityCount} hint="oportunidades en curso" icon={KanbanSquare} trend={opportunitiesTrend} />
        </Link>
      </div>

      <section className="mt-6 space-y-3">
        <div>
          <p className="bee-eyebrow">Todas las etapas</p>
          <h2 className="mt-1 text-base font-semibold">Embudo de cierre</h2>
        </div>
        <PipelineFunnel opportunities={opportunities} />
      </section>

      <div className="mt-3 grid items-stretch gap-3 lg:grid-cols-2">
        <section className="bee-surface flex flex-col p-5 space-y-3">
          <div>
            <p className="bee-eyebrow">Industria × Tipo de señal</p>
            <h2 className="mt-1 text-base font-semibold">Dónde eres más fuerte</h2>
          </div>
          <div className="flex-1">
            <IndustrySignalHeatmap
              opportunities={opportunities}
              signals={signals}
              companies={companiesResult?.data ?? []}
            />
          </div>
        </section>

        <section className="bee-surface flex flex-col p-5 space-y-3">
          <div>
            <p className="bee-eyebrow">Día × hora</p>
            <h2 className="mt-1 text-base font-semibold">Cuándo llega el mercado</h2>
          </div>
          <div className="flex-1">
            <SignalActivityHeatmap signals={signals} />
          </div>
        </section>
      </div>
    </div>
  );
}
