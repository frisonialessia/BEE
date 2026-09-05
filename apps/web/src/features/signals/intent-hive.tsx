"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Honeycomb, type HiveCellAnchor, type HiveItem } from "@/components/charts/honeycomb";
import { HIVE_RAMP, REST, TONE, pickedColor } from "@/components/charts/palette";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useHiveLeads, useSetHiveTemperature } from "@/hooks/queries/use-lead-board";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { formatAmount } from "@/lib/i18n/format";
import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import type { Company, Opportunity } from "@/types/domain";
import type { HotLeadScore } from "@/types/extended";

// The colors an industry cycles through when grouping is on — the same
// six BEE hues everything else uses, never a new one per industry name.
const GROUP_TONES = [TONE.market, TONE.prepared, TONE.urgency, TONE.forecast, TONE.calm, TONE.marketDeep] as const;

/** The four buying stages, hot → cool — the order of the pills above the comb. */
export const HIVE_STAGES = ["ready_to_buy", "decision", "consideration", "awareness"] as const;
export type HiveStage = (typeof HIVE_STAGES)[number];
const STAGES = HIVE_STAGES;
type Stage = HiveStage;

/** The ramp step each buying stage reads in the metrics under the comb —
 *  the same steps its cells tend to land on (hot centre → cool edge). */
export const STAGE_STEP: Record<Stage, number> = { ready_to_buy: 0, decision: 3, consideration: 7, awareness: 9 };

/** The three temperatures a person can set by hand, on the same 0–100
 *  scale BEE scores with: cold sits in the outer ring, hot in the centre. */
const MANUAL: Record<"cold" | "warm" | "hot", number> = { cold: 20, warm: 55, hot: 90 };

/** What the hive draws: the person's override when set, else BEE's score. */
export function heatOf(lead: HotLeadScore): number {
  return lead.manual_temperature ?? lead.research_intensity_score;
}

/** The stage the effective heat lands in — the backend's own thresholds. */
export function stageOf(lead: HotLeadScore): Stage {
  const heat = heatOf(lead);
  if (lead.manual_temperature === null || lead.manual_temperature === undefined) {
    return (STAGES as readonly string[]).includes(lead.buying_stage) ? (lead.buying_stage as Stage) : "awareness";
  }
  return heat >= 80 ? "ready_to_buy" : heat >= 55 ? "decision" : heat >= 30 ? "consideration" : "awareness";
}

function opportunityFor(lead: HotLeadScore, opportunities: Opportunity[], companyIdByKey: Map<string, string>): Opportunity | null {
  const companyId = companyIdByKey.get(lead.company_domain.toLowerCase()) ?? (lead.company_name ? companyIdByKey.get(lead.company_name.toLowerCase()) : undefined);
  const open = opportunities.filter((o) => !["won", "lost", "dismissed"].includes(o.status));
  const byCompany = companyId ? open.find((o) => o.company_id === companyId) : undefined;
  if (byCompany) return byCompany;
  const name = (lead.company_name ?? "").toLowerCase();
  return open.find((o) => name && o.title.toLowerCase().includes(name)) ?? (lead.lead_id ? open.find((o) => o.lead_id === lead.lead_id) : undefined) ?? null;
}

/**
 * The intent hive with real data — every account the Dark Funnel is
 * watching as one cell, hottest in the centre. A click opens the cell's
 * menu: set the account's temperature by hand (the comb re-sorts with the
 * cell sliding to its new ring), or open its opportunity, company or lead
 * in the one side panel. Under the comb, the four buying stages with their
 * counts. `stage` filters the comb; `maxCells` caps it to the hottest N
 * (the Resumen shows 200 and says so in the caption).
 */
export function IntentHive({
  maxLeads = 200,
  maxCells,
  maxRadius = 30,
  minHeight = 240,
  stage,
  showStages = true,
  showLegend = false,
  enableIndustryToggle = false,
  richDetail = false,
  className,
}: {
  maxLeads?: number;
  /** Draw at most the hottest N accounts. */
  maxCells?: number;
  maxRadius?: number;
  minHeight?: number;
  stage?: Stage | null;
  showStages?: boolean;
  /** A cold→hot color-scale strip under the comb (Honeycomb's own
   *  `legend` prop) — off by default, since most instances of this
   *  component sit in a box too short to spare the row. */
  showLegend?: boolean;
  /** A second sort — group by industry, hottest within each group —
   *  next to the default "by intent" one, with each industry's cells
   *  sharing an outline color. Off by default: it needs `Company.industry`
   *  populated to say anything, and a row of control the smaller
   *  instances of this component (an account panel) have no room for. */
  enableIndustryToggle?: boolean;
  /** Adds the linked opportunity's deal value and how recently the
   *  account's last signal landed to each cell's tooltip detail — the
   *  Resumen-only "richer hive" the founder asked for; off elsewhere so
   *  the tooltip stays exactly what it's always been. */
  richDetail?: boolean;
  className?: string;
}) {
  const t = useTranslations("shared.intentHive");
  const locale = useLocale() as Locale;
  const { data: result, isLoading } = useHiveLeads(maxLeads);
  const { data: oppsResult } = useOpportunities(undefined, 2200);
  const { data: companiesResult } = useCompanies(300);
  const { openOpportunity, openNew } = useOpportunityDrawer();
  const setTemperature = useSetHiveTemperature();
  const [selected, setSelected] = useState<{ id: string; anchor: HiveCellAnchor } | null>(null);
  const [sortMode, setSortMode] = useState<"intent" | "industry">("intent");
  const [now] = useState(() => Date.now());
  const boxRef = useRef<HTMLDivElement>(null);

  const leads = useMemo(() => result?.data ?? [], [result?.data]);
  const opportunities = useMemo(() => oppsResult?.data ?? [], [oppsResult]);
  const companyIdByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companiesResult?.data ?? []) {
      map.set(c.name.toLowerCase(), c.id);
      if (c.domain) map.set(c.domain.toLowerCase(), c.id);
    }
    return map;
  }, [companiesResult]);
  // Same keying as companyIdByKey above, just carrying the whole company
  // (for its industry) instead of only the id — no second fetch.
  const companyByKey = useMemo(() => {
    const map = new Map<string, Company>();
    for (const c of companiesResult?.data ?? []) {
      map.set(c.name.toLowerCase(), c);
      if (c.domain) map.set(c.domain.toLowerCase(), c);
    }
    return map;
  }, [companiesResult]);
  const industryOf = (lead: HotLeadScore): string | null =>
    companyByKey.get(lead.company_domain.toLowerCase())?.industry ??
    (lead.company_name ? companyByKey.get(lead.company_name.toLowerCase())?.industry : undefined) ??
    null;

  const hottestVisible = useMemo(() => {
    const filtered = leads.filter((l) => !stage || stageOf(l) === stage).sort((a, b) => heatOf(b) - heatOf(a));
    return maxCells ? filtered.slice(0, maxCells) : filtered;
  }, [leads, stage, maxCells]);
  const totalMatching = leads.filter((l) => !stage || stageOf(l) === stage).length;

  // Grouping only ever reorders which of the already-hottest N accounts
  // sit next to each other in the spiral — it never changes which
  // accounts are shown (that's still purely the top N by heat, above).
  const visible = useMemo(() => {
    if (sortMode !== "industry") return hottestVisible;
    return [...hottestVisible].sort((a, b) => {
      const ia = industryOf(a) ?? "";
      const ib = industryOf(b) ?? "";
      return ia !== ib ? ia.localeCompare(ib) : heatOf(b) - heatOf(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- industryOf closes over companyByKey, already a dep of hottestVisible's own inputs
  }, [hottestVisible, sortMode]);

  const groupColorByIndustry = useMemo(() => {
    if (sortMode !== "industry") return new Map<string, string>();
    const names = [...new Set(visible.map((l) => industryOf(l) ?? t("noIndustry")))].sort((a, b) => a.localeCompare(b));
    return new Map(names.map((name, i) => [name, GROUP_TONES[i % GROUP_TONES.length]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sortMode, t]);

  const items = useMemo<HiveItem[]>(
    () =>
      visible.map((l) => {
        const opp = opportunityFor(l, opportunities, companyIdByKey);
        const extra: string[] = [];
        if (richDetail) {
          if (opp?.amount) extra.push(t("dealValue", { amount: formatAmount(opp.amount, locale) }));
          if (l.last_signal_at) {
            const days = Math.floor((now - new Date(l.last_signal_at).getTime()) / 86_400_000);
            if (days >= 0) extra.push(t("sinceDays", { days }));
          }
        }
        const keywordDetail = l.top_intent_keywords.slice(0, 3).join(" · ") || undefined;
        return {
          id: l.id,
          heat: heatOf(l),
          label: l.company_name ?? l.company_domain,
          caption: `${t(`stages.${stageOf(l)}`)} · ${t("score", { score: Math.round(heatOf(l)) })}${l.manual_temperature != null ? ` · ${t("manual")}` : ""}`,
          detail: [keywordDetail, ...extra].filter(Boolean).join(" · ") || undefined,
          mark: pickedColor(opp?.color ?? null),
          groupColor: sortMode === "industry" ? (groupColorByIndustry.get(industryOf(l) ?? t("noIndustry")) ?? null) : null,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- industryOf closes over companyByKey
    [visible, opportunities, companyIdByKey, t, richDetail, locale, sortMode, groupColorByIndustry, now],
  );

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { ready_to_buy: 0, decision: 0, consideration: 0, awareness: 0 };
    for (const l of leads) c[stageOf(l)] += 1;
    return c;
  }, [leads]);
  const maxCount = Math.max(1, ...STAGES.map((s) => counts[s]));

  // Esc or a click outside closes the cell menu.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [selected]);

  const selectedLead = selected ? leads.find((l) => l.id === selected.id) ?? null : null;
  const selectedOpp = selectedLead ? opportunityFor(selectedLead, opportunities, companyIdByKey) : null;
  const selectedCompanyId = selectedLead ? companyIdByKey.get(selectedLead.company_domain.toLowerCase()) ?? (selectedLead.company_name ? companyIdByKey.get(selectedLead.company_name.toLowerCase()) : undefined) ?? null : null;

  function applyTemperature(temperature: number | null) {
    if (!selectedLead) return;
    setTemperature.mutate(
      { id: selectedLead.id, temperature },
      { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("error")) },
    );
  }

  function open() {
    if (!selectedLead) return;
    setSelected(null);
    if (selectedOpp) openOpportunity(selectedOpp.id);
    else if (selectedCompanyId) openNew({ companyId: selectedCompanyId });
    else if (selectedLead.lead_id) openNew({ leadId: selectedLead.lead_id });
    else openNew();
  }

  if (isLoading) return <Skeleton className={cn("w-full", className)} style={{ minHeight }} />;

  const current = selectedLead?.manual_temperature ?? null;
  const level = current === null ? null : current >= 80 ? "hot" : current >= 40 ? "warm" : "cold";

  return (
    <div className={cn("bee-fill flex min-h-0 flex-col", className)}>
      {enableIndustryToggle && (
        <div className="mb-2 flex shrink-0 items-center gap-1 self-end" role="group" aria-label={t("sortIntent")}>
          {(["intent", "industry"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              aria-pressed={sortMode === mode}
              className={cn("bee-btn-ghost !px-2.5 !py-1 !text-xs", sortMode === mode && "bee-btn-ghost--active")}
            >
              {t(mode === "intent" ? "sortIntent" : "sortIndustry")}
            </button>
          ))}
        </div>
      )}
      <div ref={boxRef} className="bee-fill relative flex min-h-0 flex-col">
        <Honeycomb
          items={items}
          onSelect={(item, anchor) => setSelected((prev) => (prev?.id === item.id ? null : { id: item.id, anchor }))}
          selectedId={selected?.id ?? null}
          maxRadius={maxRadius}
          minHeight={minHeight}
          emptyHint={t("empty")}
          ariaLabel={t("aria", { count: items.length })}
          legend={showLegend ? { cold: t("legendCold"), hot: t("legendHot") } : undefined}
        />
        {selected && selectedLead && (
          <div
            role="dialog"
            aria-label={selectedLead.company_name ?? selectedLead.company_domain}
            className="bee-card absolute z-20 w-64 !h-auto !p-4 shadow-[var(--bee-shadow-card-lift)]"
            style={{
              left: selected.anchor.x / selected.anchor.width > 0.6 ? undefined : selected.anchor.x + selected.anchor.radius + 8,
              right: selected.anchor.x / selected.anchor.width > 0.6 ? selected.anchor.width - selected.anchor.x + selected.anchor.radius + 8 : undefined,
              top: Math.max(0, Math.min(selected.anchor.y - 24, selected.anchor.height - 200)),
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{selectedLead.company_name ?? selectedLead.company_domain}</p>
                <p className="bee-caption truncate">
                  {t(`stages.${stageOf(selectedLead)}`)} · {t("score", { score: Math.round(heatOf(selectedLead)) })}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label={t("close")} className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-[var(--color-background)]">
                <X className="size-3.5" />
              </button>
            </div>

            <p className="bee-caption mt-3">{t("temperature")}</p>
            <div className="mt-1.5 flex items-center gap-2">
              {(["cold", "warm", "hot"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={level === k}
                  aria-label={t(k)}
                  title={t(k)}
                  onClick={() => applyTemperature(MANUAL[k])}
                  className="bee-dot"
                  style={{ background: HIVE_RAMP[k === "hot" ? 0 : k === "warm" ? 5 : 9] }}
                />
              ))}
              {current !== null && (
                <button type="button" onClick={() => applyTemperature(null)} className="bee-btn-text ml-1 !text-xs">
                  {t("reset")}
                </button>
              )}
            </div>
            <p className="bee-micro mt-1.5">{t("temperatureHint")}</p>

            <button type="button" onClick={open} className="bee-btn bee-btn--primary mt-3 w-full !text-sm">
              {selectedOpp ? t("openOpportunity") : selectedCompanyId ? t("openCompany") : selectedLead.lead_id ? t("openLead") : t("createOpportunity")}
            </button>
          </div>
        )}
      </div>
      {maxCells && totalMatching > maxCells && (
        <p className="bee-caption mt-2 text-center">{t("showing", { shown: items.length, total: totalMatching })}</p>
      )}
      {showStages && (
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--color-divider)] pt-4 sm:grid-cols-4">
          {STAGES.map((s) => (
            <div key={s} className="min-w-0">
              <p className="bee-caption truncate">{t(`stages.${s}`)}</p>
              <p className="text-lg font-bold leading-tight tabular-nums">{counts[s]}</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: REST }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round((counts[s] / maxCount) * 100)}%`, background: HIVE_RAMP[STAGE_STEP[s]] }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
