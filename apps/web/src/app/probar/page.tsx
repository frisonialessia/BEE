"use client";

import { KanbanSquare, Radio } from "lucide-react";
import Link from "next/link";

import { AddCompanyForm } from "@/features/probar/add-company-form";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";

/** Landing page of the sandbox — a light overview, not a full "Resumen"
 * (the real Dashboard's KPI-dense one). Counts go through the same
 * useOpportunities/useSignals hooks the rest of the app uses (not
 * lib/demo/store directly) — TanStack Query's data starts undefined until
 * mounted, matching the server-rendered page (this route is statically
 * prerendered, so there's no localStorage at build time) instead of
 * mismatching it, which a `typeof window` check alone would risk doing on
 * a returning visitor's own browser. */
export default function ProbarOverviewPage() {
  const { data: opportunitiesResult } = useOpportunities();
  const { data: signalsResult } = useSignals();
  const opportunityCount = opportunitiesResult?.data.length ?? 0;
  const signalCount = signalsResult?.data.length ?? 0;

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

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/probar/signals" className="bee-bento bee-bento-pad bee-glass--hover block">
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

        <Link href="/probar/crm" className="bee-bento bee-bento-pad bee-glass--hover block">
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
    </div>
  );
}
