"use client";

import { KanbanSquare, Radio } from "lucide-react";
import Link from "next/link";

import { IndustrySignalHeatmap } from "@/components/dashboard/industry-signal-heatmap";
import { PipelineFunnel } from "@/components/dashboard/pipeline-funnel";
import { SignalActivityHeatmap } from "@/components/dashboard/signal-activity-heatmap";
import { AddCompanyForm } from "@/features/probar/add-company-form";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";

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
  const opportunityCount = opportunitiesResult?.data.length ?? 0;
  const signalCount = signalsResult?.data.length ?? 0;
  const signals = signalsResult?.data ?? [];

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

      {/* Tarjetas cortas (un título + un número, nada de texto largo) →
       * caja con su propio scroll horizontal, mismo patrón que las
       * columnas del Pipeline (ver crm-board.tsx): el contenedor se
       * desplaza, la página nunca. SignalsDashboard hace lo contrario a
       * propósito — sus tarjetas sí tienen texto largo (título +
       * descripción + tags), así que ahí la columna apilada es la
       * correcta, no un descuido. */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        <Link
          href="/probar/signals"
          className="bee-bento bee-bento-pad bee-glass--hover block w-[min(85%,280px)] shrink-0"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
              <Radio className="size-4 stroke-[1.5] text-[var(--color-chart-4)]" />
            </div>
            <div>
              <p className="text-sm font-semibold">Señales</p>
              <p className="bee-caption mt-0.5">{signalCount} triggers de mercado detectados</p>
            </div>
          </div>
        </Link>

        <Link
          href="/probar/crm"
          className="bee-bento bee-bento-pad bee-glass--hover block w-[min(85%,280px)] shrink-0"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
              <KanbanSquare className="size-4 stroke-[1.5] text-[var(--color-chart-4)]" />
            </div>
            <div>
              <p className="text-sm font-semibold">Pipeline</p>
              <p className="bee-caption mt-0.5">{opportunityCount} oportunidades en curso</p>
            </div>
          </div>
        </Link>
      </div>

      <section className="mt-6 space-y-3">
        <div>
          <p className="bee-eyebrow">Todo el pipeline</p>
          <h2 className="mt-1 text-base font-semibold">Embudo de cierre</h2>
        </div>
        <PipelineFunnel opportunities={opportunitiesResult?.data ?? []} />
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="bee-surface p-5 space-y-3">
          <div>
            <p className="bee-eyebrow">Industria × Tipo de señal</p>
            <h2 className="mt-1 text-base font-semibold">Dónde eres más fuerte</h2>
          </div>
          <IndustrySignalHeatmap
            opportunities={opportunitiesResult?.data ?? []}
            signals={signals}
            companies={companiesResult?.data ?? []}
          />
        </section>

        <section className="bee-surface p-5 space-y-3">
          <div>
            <p className="bee-eyebrow">Día × hora</p>
            <h2 className="mt-1 text-base font-semibold">Cuándo llega el mercado</h2>
          </div>
          <SignalActivityHeatmap signals={signals} />
        </section>
      </div>
    </div>
  );
}
