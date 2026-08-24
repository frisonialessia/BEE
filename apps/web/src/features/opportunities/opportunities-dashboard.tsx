"use client";

import { Bot } from "lucide-react";

import { BattlecardView } from "@/components/battlecard";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { PipelineFlow } from "@/features/opportunities/pipeline-flow";
import { usePagination } from "@/hooks/use-pagination";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useUsers } from "@/hooks/queries/use-users";

/** Etiquetas en español para el estado de la oportunidad, para el CSV exportado. */
const STATUS_LABELS: Record<string, string> = {
  detected: "Detectada",
  ready_to_action: "Lista para actuar",
  prioritized: "Priorizada",
  in_progress: "En progreso",
  won: "Ganada",
  lost: "Perdida",
  dismissed: "Descartada",
};

/** Oportunidades y battlecards — plays listos para el CEO. */
export function OpportunitiesDashboard() {
  const { data: battlecardsResult, isLoading: loadingBattlecards } = useBattlecards();
  const { data: allOppsResult, isLoading: loadingOpps } = useOpportunities(undefined, 200);
  const { data: companiesResult } = useCompanies(200);
  const { data: users } = useUsers();
  const { openOpportunity } = useOpportunityDrawer();

  const battlecards = battlecardsResult?.data ?? [];
  const opportunities = allOppsResult?.data ?? [];
  const live = Boolean(battlecardsResult?.live || allOppsResult?.live);
  const loading = loadingBattlecards || loadingOpps;

  const battlecardPagination = usePagination(battlecards);

  const companyById = new Map((companiesResult?.data ?? []).map((c) => [c.id, c]));
  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  const exportRows = opportunities.map((o) => ({
    titulo: o.title.replace(/^Opportunity:\s*/, ""),
    estado: STATUS_LABELS[o.status] ?? o.status,
    puntaje: Math.round(o.score),
    empresa: o.company_id ? (companyById.get(o.company_id)?.name ?? "") : "",
    responsable: o.assigned_to_user_id ? (userById.get(o.assigned_to_user_id)?.full_name ?? "") : "",
  }));

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Battlecards y análisis</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">Oportunidades</h1>
            <p className="bee-caption mt-1">
              Battlecards enriquecidos con pain point, argumento de cierre y ventana de timing — el
              pipeline arrastrable vive en CRM
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={live ? "success" : "warning"}>
              {live ? "En vivo" : "Datos demo"}
            </Badge>
            <ExportCsvButton
              rows={exportRows}
              filename="bee-oportunidades.csv"
              columns={[
                { key: "titulo", header: "Título" },
                { key: "estado", header: "Estado" },
                { key: "puntaje", header: "Puntaje" },
                { key: "empresa", header: "Empresa" },
                { key: "responsable", header: "Responsable" },
              ]}
            />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <Tabs defaultValue="battlecards">
          <TabsList className="border border-border bg-background">
            <TabsTrigger value="battlecards" className="rounded-sm">
              Battlecards ({battlecards.length})
            </TabsTrigger>
            <TabsTrigger value="flujo" className="rounded-sm">
              Flujo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="battlecards" className="mt-6 space-y-4">
            {battlecards.length === 0 ? (
              <div className="bee-bento bee-bento-pad py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Aún no hay battlecards listas para acción.
                </p>
                <p className="bee-caption mt-1">Las señales deben enriquecerse primero.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Bot className="size-3.5" />
                  Clic en una tarjeta para abrir el drawer de oportunidad
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {battlecardPagination.pageItems.map((card, i) => (
                    <button
                      key={card.opportunity_id}
                      type="button"
                      onClick={() => openOpportunity(card.opportunity_id)}
                      className={`bee-bento bee-bento-pad-lg text-left hover:border-[var(--color-chart-4)] ${
                        i % 2 === 0 ? "bee-bento--primary" : ""
                      }`}
                    >
                      <BattlecardView card={card} />
                    </button>
                  ))}
                </div>
                <PaginationBar
                  page={battlecardPagination.page}
                  pageSize={battlecardPagination.pageSize}
                  totalPages={battlecardPagination.totalPages}
                  totalItems={battlecardPagination.totalItems}
                  onPageChange={battlecardPagination.goToPage}
                  onPageSizeChange={battlecardPagination.changePageSize}
                  itemLabel="battlecards"
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="flujo" className="mt-6">
            <PipelineFlow opportunities={opportunities} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
