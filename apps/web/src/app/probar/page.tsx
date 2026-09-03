"use client";

import { Building2, KanbanSquare, Radio, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { IndustrySignalHeatmap } from "@/components/dashboard/industry-signal-heatmap";
import { PipelineFunnel } from "@/components/dashboard/pipeline-funnel";
import { SignalActivityHeatmap } from "@/components/dashboard/signal-activity-heatmap";
import { AddCompanyForm } from "@/features/probar/add-company-form";
import { SignalHexMap } from "@/features/control/components/SignalHexMap";
import { Leaderboard } from "@/features/dashboard/leaderboard";
import { MyCalendarWidget } from "@/features/calendar/my-calendar-widget";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useTeams } from "@/hooks/queries/use-teams";
import { useUsers } from "@/hooks/queries/use-users";

// Mismos íconos que nav-items.ts usa para estos 4 destinos — el tile queda
// visualmente casado con el link al que apunta, no con un ícono elegido
// aparte.
const KPI_TILES = [
  { key: "signals", navKey: "signals", href: "/probar/signals", icon: Radio },
  { key: "crm", navKey: "crm", href: "/probar/crm", icon: KanbanSquare },
  { key: "leads", navKey: "leads", href: "/probar/leads", icon: Users },
  { key: "companies", navKey: "companies", href: "/probar/companies", icon: Building2 },
] as const;

/** Landing page of the sandbox — nav calls it "Resumen" too, so a visitor
 * exploring the sandbox should see the same depth the real Dashboard's
 * "Resumen" shows (mi calendario / colmena de intención / leaderboard en
 * una fila, embudo, heatmap industria × señal, heatmap de actividad), fit
 * into one screen: a KPI strip this compact only makes
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
  const t = useTranslations("probar.overview");
  const tNav = useTranslations("nav.items");
  const tDash = useTranslations("dashboardOverview.overview.sections");
  const { data: opportunitiesResult } = useOpportunities();
  const { data: signalsResult } = useSignals();
  const { data: companiesResult } = useCompanies(200);
  const { data: leadsResult } = useLeads(200);
  const { data: usersResult } = useUsers();
  const { data: teamsResult } = useTeams();
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
            <h1 className="bee-display">{t("title")}</h1>
            <p className="bee-caption mt-1 max-w-xl">{t("subtitle")}</p>
          </div>
          <AddCompanyForm />
        </div>
      </header>

      {/* Fila compacta de orientación — 4 números, no 2 tarjetas grandes.
       * "CRM", no "Pipeline": ese nombre ya es de otra sección (Dark
       * Funnel) — usar la palabra suelta acá confundiría a cuál se
       * refiere el link. */}
      <div className="bee-kpi-strip !mt-0">
        {KPI_TILES.map((tile) => (
          <Link key={tile.key} href={tile.href} className="bee-kpi-tile bee-glass--hover block">
            <div className="flex items-center justify-between gap-2">
              <p className="bee-kpi-tile__label">{tNav(tile.navKey)}</p>
              <tile.icon className="size-3.5 shrink-0 text-muted-foreground stroke-[1.25]" />
            </div>
            <p className="bee-kpi-tile__value">{counts[tile.key]}</p>
          </Link>
        ))}
      </div>

      {/* Mismo layout que el Resumen real (dashboard-overview.tsx): la
       * Colmena a 2/3 de ancho como pieza hero, Mi calendario y el
       * Leaderboard apilados en el tercio restante — items-start para que
       * cada columna mida según su propio contenido en vez de estirarse a
       * la altura de la Colmena y dejar espacio en blanco debajo. */}
      <div className="mt-2 grid items-start gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SignalHexMap height={280} />
        </div>
        <div className="flex flex-col gap-3">
          <MyCalendarWidget />
          <Leaderboard opportunities={opportunities} users={usersResult ?? []} teams={teamsResult ?? []} />
        </div>
      </div>

      {/* Mismo título/caption que estas dos secciones ya usan en el Resumen
       * real (dashboard-overview.tsx) — acá corrían con un solo renglón
       * bee-eyebrow en mayúsculas, el único par de secciones de esta
       * página que no coincidía con su versión real. Con la Colmena de
       * arriba usando bee-card-title, esa diferencia de peso tipográfico
       * quedaba mucho más visible que antes de agregarla. */}
      <div className="mt-2 grid items-start gap-3 lg:grid-cols-2">
        <section className="bee-surface bee-bento-pad space-y-3">
          <div>
            <h3 className="bee-card-title">{tDash("industryHeatmap.title")}</h3>
            <p className="bee-caption">{tDash("industryHeatmap.caption")}</p>
          </div>
          <IndustrySignalHeatmap
            opportunities={opportunities}
            signals={signals}
            companies={companiesResult?.data ?? []}
          />
        </section>

        <section className="bee-surface bee-bento-pad space-y-3">
          <div>
            <h3 className="bee-card-title">{tDash("activityHeatmap.title")}</h3>
            <p className="bee-caption">{tDash("activityHeatmap.caption")}</p>
          </div>
          <SignalActivityHeatmap signals={signals} />
        </section>
      </div>

      <section className="mt-2 space-y-2">
        <p className="bee-eyebrow">{t("funnelEyebrow")}</p>
        <PipelineFunnel opportunities={opportunities} />
      </section>
    </div>
  );
}
