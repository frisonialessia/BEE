"use client";

import { Bot, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { BattlecardView } from "@/components/battlecard";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { PipelineFlow } from "@/features/opportunities/pipeline-flow";
import { usePagination } from "@/hooks/use-pagination";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { STAGE_TONE } from "@/lib/crm-board";
import { stripOpportunityTitlePrefix } from "@/lib/format";
import { SALES, mix } from "@/components/charts/palette";
import { formatCurrencyUSDCompact, formatDate } from "@/lib/i18n/format";

/**
 * The three non-board views of the pipeline, each a top-level tab of the
 * CRM page (see crm-view.tsx):
 *
 *  - OpportunitiesList — every opportunity as a searchable, sortable
 *    table (company, stage, owner, amount, close date, score) with CSV
 *    export. The "spreadsheet" view the board can't give.
 *  - BattlecardsGallery — the AI-enriched plays, one card each.
 *  - PipelineFlowTab — the aggregate stage-to-stage flow.
 *
 * They used to be nested (Oportunidades → Battlecards | Flujo); lifting
 * them to the CRM's own tab strip means one click to any view, and gives
 * "Oportunidades" a content of its own instead of being a wrapper.
 */

export function OpportunitiesList() {
  const t = useTranslations("opportunitiesPriority.opportunities");
  const locale = useLocale() as Locale;
  const { data: allOppsResult, isLoading } = useOpportunities(undefined, 300);
  const { data: companiesResult } = useCompanies(200);
  const { data: users } = useUsers();
  const { openOpportunity } = useOpportunityDrawer();
  const [query, setQuery] = useState("");

  const companyById = useMemo(
    () => new Map((companiesResult?.data ?? []).map((c) => [c.id, c])),
    [companiesResult],
  );
  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const rows = useMemo(() => {
    const all = (allOppsResult?.data ?? []).map((o) => ({
      opportunity: o,
      title: stripOpportunityTitlePrefix(o.title),
      company: o.company_id ? (companyById.get(o.company_id)?.name ?? "") : "",
      owner: o.assigned_to_user_id ? (userById.get(o.assigned_to_user_id)?.full_name ?? "") : "",
    }));
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter((r) => r.title.toLowerCase().includes(q) || r.company.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q))
      : all;
    return filtered.sort((a, b) => b.opportunity.score - a.opportunity.score);
  }, [allOppsResult, companyById, userById, query]);

  const pagination = usePagination(rows);

  const exportRows = rows.map((r) => ({
    titulo: r.title,
    estado: t(`status.${r.opportunity.status}`),
    puntaje: Math.round(r.opportunity.score),
    empresa: r.company,
    responsable: r.owner,
  }));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* The stage flow used to be its own "Flujo" tab — one chart alone on a
          page. It reads better as the summary above the list it describes. */}
      <PipelineFlow opportunities={allOppsResult?.data ?? []} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="relative block w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("list.searchPlaceholder")}
            className="bee-input"
            style={{ paddingLeft: "2rem" }}
          />
        </label>
        <ExportCsvButton
          rows={exportRows}
          filename={t("exportFilename")}
          columns={[
            { key: "titulo", header: t("csv.title") },
            { key: "estado", header: t("csv.status") },
            { key: "puntaje", header: t("csv.score") },
            { key: "empresa", header: t("csv.company") },
            { key: "responsable", header: t("csv.owner") },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="bee-bento bee-bento-pad py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
        </div>
      ) : (
        <>
          <div className="bee-bento overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="bee-eyebrow px-3 py-2.5 font-medium">{t("list.columns.title")}</th>
                  <th className="bee-eyebrow px-3 py-2.5 font-medium">{t("list.columns.company")}</th>
                  <th className="bee-eyebrow px-3 py-2.5 font-medium">{t("list.columns.stage")}</th>
                  <th className="bee-eyebrow px-3 py-2.5 font-medium">{t("list.columns.owner")}</th>
                  <th className="bee-eyebrow px-3 py-2.5 text-right font-medium">{t("list.columns.amount")}</th>
                  <th className="bee-eyebrow px-3 py-2.5 font-medium">{t("list.columns.close")}</th>
                  <th className="bee-eyebrow px-3 py-2.5 text-right font-medium">{t("list.columns.score")}</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map(({ opportunity: o, title, company, owner }) => (
                  <tr
                    key={o.id}
                    onClick={() => openOpportunity(o.id)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-[var(--color-primary)]/25"
                  >
                    <td className="px-3 py-2.5">
                      <span className="line-clamp-1 font-medium">{title}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{company || t("list.noCompany")}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: o.status === "won" ? SALES.won : STAGE_TONE[o.status].bar }}
                          aria-hidden="true"
                        />
                        {t(`status.${o.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{owner || t("list.unassigned")}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {o.amount != null ? formatCurrencyUSDCompact(o.amount, locale) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {o.expected_close_date ? formatDate(o.expected_close_date, locale) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {/* The score wears the stage's own color (greens once won),
                          so a row never mixes two hues. */}
                      <span
                        className="inline-block rounded-full px-2 py-0.5 font-mono text-micro font-semibold tabular-nums text-[var(--color-text)]"
                        style={{ background: o.status === "won" ? SALES.mint : mix(STAGE_TONE[o.status].bar, 24) }}
                      >
                        {Math.round(o.score)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            onPageChange={pagination.goToPage}
            onPageSizeChange={pagination.changePageSize}
            itemLabel={t("list.itemLabel")}
          />
        </>
      )}
    </div>
  );
}

export function BattlecardsGallery() {
  const t = useTranslations("opportunitiesPriority.opportunities");
  const { data: battlecardsResult, isLoading } = useBattlecards();
  const { openOpportunity } = useOpportunityDrawer();
  const battlecards = battlecardsResult?.data ?? [];
  const pagination = usePagination(battlecards);

  if (isLoading) return <Skeleton className="h-64" />;

  if (battlecards.length === 0) {
    return (
      <div className="bee-bento bee-bento-pad py-8 text-center">
        <p className="text-sm text-muted-foreground">{t("emptyBattlecards.title")}</p>
        <p className="bee-caption mt-1">{t("emptyBattlecards.subtitle")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Bot className="size-3.5" />
        {t("battlecardsHint")}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {pagination.pageItems.map((card) => (
          <button
            key={card.opportunity_id}
            type="button"
            onClick={() => openOpportunity(card.opportunity_id)}
            className="bee-bento bee-bento-pad text-left hover:border-[var(--color-chart-4)]"
          >
            <BattlecardView card={card} />
          </button>
        ))}
      </div>
      <PaginationBar
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        onPageChange={pagination.goToPage}
        onPageSizeChange={pagination.changePageSize}
        itemLabel="battlecards"
      />
    </div>
  );
}

export function PipelineFlowTab() {
  const { data: allOppsResult, isLoading } = useOpportunities(undefined, 300);
  if (isLoading) return <Skeleton className="h-64" />;
  return <PipelineFlow opportunities={allOppsResult?.data ?? []} />;
}
