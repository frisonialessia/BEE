"use client";

import { Building2, KanbanSquare, Radio, Users } from "lucide-react";
import Link from "next/link";

import { IndustrySignalHeatmap } from "@/components/dashboard/industry-signal-heatmap";
import { PipelineFunnel } from "@/components/dashboard/pipeline-funnel";
import { SignalActivityHeatmap } from "@/components/dashboard/signal-activity-heatmap";
import { AddCompanyForm } from "@/features/probar/add-company-form";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";

// Mismos íconos que nav-items.ts usa para estos 4 destinos — el tile queda
// visualmente casado con el link al que apunta, no con un ícono elegido
// aparte.
const KPI_TILES = [
  { key: "signals", label: "Señales", href: "/probar/signals", icon: Radio },
  { key: "crm", label: "CRM", href: "/probar/crm", icon: KanbanSquare },
  { key: "leads", label: "Leads", href: "/probar/leads", icon: Users },
  { key: "companies", label: "Empresas", href: "/probar/companies", icon: Building2 },
] as const;

/** Landing page of the sandbox — nav calls it "Resumen" too, so a visitor
 * exploring the sandbox should see the same depth the real Dashboard's
 * "Resumen" shows (embudo, heatmap industria × señal, heatmap de
 * actividad), fit into one screen: a KPI strip this compact only makes
 * sense as a quick orientation row, not competing for space with the
 * widgets that actually carry the depth. Counts/widgets go through the
 * same hooks the rest of the app uses (not lib/demo/store directly) —
 * TanStack Query's data starts undefined until mounted, matching the
 * server-rendered page (this route is statically prerendered, so there's
 * no localStorage at build time) instead of mismatching it, which a
 * `typeof window` check alone would risk doing on a returning visitor's
 * own browser.
 *
 * No "Oportunidades" tile next to "CRM": both nav items already read the
 * same Opportunity rows (CRM = kanban board, Oportunidades = battlecards
 * + flow) — a second count next to CRM's would either duplicate it or,
 * worse, differ by a filter the tile can't explain, reopening the exact
 * "which number means what" confusion "CRM" vs. "Dark Funnel" already ran
 * into. Leads and Empresas are genuinely distinct entities with nothing
 * else counting them on this page. */
export default function ProbarOverviewPage() {
  const { data: opportunitiesResult } = useOpportunities();
  const { data: signalsResult } = useSignals();
  const { data: companiesResult } = useCompanies(200);
  const { data: leadsResult } = useLeads(200);
  const opportunities = opportunitiesResult?.data ?? [];
  const signals = signalsResult?.data ?? [];

  const counts: Record<(typeof KPI_TILES)[number]["key"], number> = {
    signals: signals.length,
    crm: opportunities.length,
    leads: leadsResult?.data.length ?? 0,
    companies: companiesResult?.data.length ?? 0,
  };

  return (
    <div>
      <header className="mb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">Así ve BEE tu mercado</h1>
            <p className="bee-caption mt-1 max-w-xl">
              Señales detectadas → pipeline priorizado → estrategia lista para ejecutar.
            </p>
          </div>
          <AddCompanyForm />
        </div>
      </header>

      {/* Fila compacta de orientación — 4 números, no 2 tarjetas grandes.
       * "CRM", no "Pipeline": ese nombre ya es de otra sección (Dark
       * Funnel) — usar la palabra suelta acá confundiría a cuál se
       * refiere el link. */}
      <div className="bee-kpi-strip !mt-0 !grid-cols-4">
        {KPI_TILES.map((tile) => (
          <Link key={tile.key} href={tile.href} className="bee-kpi-tile bee-glass--hover block">
            <div className="flex items-center justify-between gap-2">
              <p className="bee-kpi-tile__label">{tile.label}</p>
              <tile.icon className="size-3.5 shrink-0 text-muted-foreground stroke-[1.25]" />
            </div>
            <p className="bee-kpi-tile__value">{counts[tile.key]}</p>
          </Link>
        ))}
      </div>

      <section className="mt-2 space-y-2">
        <p className="bee-eyebrow">Todas las etapas · Embudo de cierre</p>
        <PipelineFunnel opportunities={opportunities} />
      </section>

      <div className="mt-2 grid items-start gap-3 lg:grid-cols-2">
        <section className="bee-surface p-3 space-y-2">
          <p className="bee-eyebrow">Industria × Tipo de señal · Dónde eres más fuerte</p>
          <IndustrySignalHeatmap
            opportunities={opportunities}
            signals={signals}
            companies={companiesResult?.data ?? []}
          />
        </section>

        <section className="bee-surface p-3 space-y-2">
          <p className="bee-eyebrow">Día × hora · Cuándo llega el mercado</p>
          <SignalActivityHeatmap signals={signals} />
        </section>
      </div>
    </div>
  );
}
