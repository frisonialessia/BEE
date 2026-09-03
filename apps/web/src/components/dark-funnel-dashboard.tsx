"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { DarkFunnelSummary, HotLeadScore } from "@/lib/types";
import { getDarkFunnelHotLeads, getDarkFunnelSummary, ingestDarkFunnelSignal } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { KpiStrip } from "@/components/metric-card";
import { Donut } from "@/components/charts/donut";
import { DATA } from "@/components/charts/palette";
import { Skeleton } from "@/components/ui/skeleton";
import { scoreVariant } from "@/lib/format";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/locales";
import { LiveBadge } from "@/components/live-badge";

// BEE's palette has no red — the heat gradient (hottest → coolest) maps onto
// the chart accents instead: magenta (5, "hot"/success everywhere else in
// the app) → amber (1) → gold (3) → blue (4). ready_to_buy used to be
// chart-2/orange — the same hue as --destructive — so the best possible
// buying stage read as an error.
const STAGE_CONFIG: Record<string, { labelKey: string; varColor: string }> = {
  ready_to_buy: { labelKey: "stageReadyToBuy", varColor: "var(--color-chart-5)" },
  decision: { labelKey: "stageDecision", varColor: "var(--color-chart-1)" },
  consideration: { labelKey: "stageConsideration", varColor: "var(--color-chart-3)" },
  awareness: { labelKey: "stageAwareness", varColor: "var(--color-chart-4)" },
};

const SIGNAL_TYPES = [
  "pricing_view",
  "competitor_compare",
  "review_visit",
  "demo_watch",
  "product_trial",
  "case_study_view",
  "content_read",
  "job_posting",
  "search",
  "repeat_visit",
];

function HotLeadCard({ lead }: { lead: HotLeadScore }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("signalsStrategies.darkFunnel");
  const stage = STAGE_CONFIG[lead.buying_stage] ?? STAGE_CONFIG.awareness;

  return (
    <div
      className="bee-bento bee-bento-pad space-y-3"
      style={
        lead.is_hot
          ? { borderColor: "var(--color-chart-2)", background: "color-mix(in srgb, var(--color-chart-2) 8%, var(--color-card))" }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {lead.is_hot && (
              <span
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold"
                style={{
                  color: "var(--color-chart-2)",
                  borderColor: "var(--color-chart-2)",
                  background: "color-mix(in srgb, var(--color-chart-2) 15%, var(--color-background))",
                }}
              >
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{ background: "var(--color-chart-2)" }}
                />
                {t("hotBadge")}
              </span>
            )}
            <span className="text-sm font-semibold truncate">
              {lead.company_name ?? lead.company_domain}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{lead.company_domain}</p>
        </div>
        {/* The score is the one urgency indicator — a number, not a number
            plus a bar saying the same thing. */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={scoreVariant(lead.research_intensity_score)} className="font-mono">
            {Math.round(lead.research_intensity_score)}
          </Badge>
          <span
            className="rounded-sm border px-2 py-0.5 text-xs font-medium"
            style={{
              color: stage.varColor,
              borderColor: stage.varColor,
              background: `color-mix(in srgb, ${stage.varColor} 15%, var(--color-background))`,
            }}
          >
            {t(stage.labelKey)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {lead.signal_types_seen.slice(0, 4).map((signalType) => (
          <span key={signalType} className="text-xs bg-[var(--color-primary)] text-muted-foreground px-2 py-1 rounded-md">
            {signalType.replace(/_/g, " ")}
          </span>
        ))}
        {lead.signal_types_seen.length > 4 && (
          <span className="text-xs text-muted-foreground">
            {t("moreCount", { count: lead.signal_types_seen.length - 4 })}
          </span>
        )}
      </div>

      {lead.top_intent_keywords.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("intentLabel")}</span>
          {lead.top_intent_keywords.slice(0, 4).join(", ")}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("signalCount", { count: lead.signal_count })}</span>
        {lead.last_signal_at && (
          <span>{t("lastLabel")}{formatDate(lead.last_signal_at, locale)}</span>
        )}
      </div>
    </div>
  );
}

export function DarkFunnelDashboard() {
  const t = useTranslations("signalsStrategies.darkFunnel");
  const [hotLeads, setHotLeads] = useState<HotLeadScore[]>([]);
  const [summary, setSummary] = useState<DarkFunnelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>("");

  // Simulate signal form state
  const [showSimulate, setShowSimulate] = useState(false);
  const [simDomain, setSimDomain] = useState("");
  const [simSignalType, setSimSignalType] = useState("pricing_view");
  const [simKeywords, setSimKeywords] = useState("");
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [leadsResult, summaryResult] = await Promise.all([
        getDarkFunnelHotLeads({ limit: 20 }),
        getDarkFunnelSummary(),
      ]);
      setHotLeads(leadsResult.data);
      setSummary(summaryResult.data);
      setLive(leadsResult.live || summaryResult.live);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = stageFilter ? hotLeads.filter((l) => l.buying_stage === stageFilter) : hotLeads;

  async function handleSimulate(e: React.FormEvent) {
    e.preventDefault();
    if (!simDomain.trim()) return;
    setSimLoading(true);
    try {
      await ingestDarkFunnelSignal({
        company_domain: simDomain.trim(),
        signal_type: simSignalType,
        intent_keywords: simKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      });
      // Reload data
      const [leadsResult, summaryResult] = await Promise.all([
        getDarkFunnelHotLeads({ limit: 20 }),
        getDarkFunnelSummary(),
      ]);
      setHotLeads(leadsResult.data);
      setSummary(summaryResult.data);
      setLive(leadsResult.live || summaryResult.live);
      setSimDomain("");
      setSimKeywords("");
      setShowSimulate(false);
    } finally {
      setSimLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <KpiStrip
              cols={2}
              items={[
                { label: t("summaryHotLeads"), value: summary.total_hot_leads, tone: "muted" },
                { label: t("summaryReadyToBuy"), value: summary.ready_to_buy_count, tone: "warm" },
                { label: t("summaryDecisionStage"), value: summary.decision_stage_count, tone: "blue" },
                { label: t("summarySignalsToday"), value: summary.total_signals_today },
              ]}
            />
          </div>
          <section className="bee-surface bee-bento-pad flex flex-col lg:col-span-4">
            <h3 className="bee-card-title">{t("stageMixTitle")}</h3>
            <p className="bee-caption mb-4">{t("stageMixCaption")}</p>
            <div className="flex min-w-0 flex-1 items-center">
              <Donut
                size={112}
                slices={[
                  { label: t("stageReadyToBuy"), value: summary.ready_to_buy_count, color: DATA.honey },
                  { label: t("stageDecision"), value: summary.decision_stage_count, color: DATA.indigo },
                  { label: t("stageConsideration"), value: summary.consideration_stage_count, color: DATA.violet },
                ]}
              />
            </div>
          </section>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="bee-filter-tabs">
          {["", "ready_to_buy", "decision", "consideration", "awareness"].map((stage) => (
            <button
              key={stage}
              onClick={() => setStageFilter(stage)}
              className={`bee-filter-tab ${stageFilter === stage ? "bee-filter-tab--active" : ""}`}
            >
              {stage === "" ? t("stageAll") : (STAGE_CONFIG[stage] ? t(STAGE_CONFIG[stage].labelKey) : stage)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LiveBadge live={live} />
          <button
            onClick={() => setShowSimulate((v) => !v)}
            className="bee-btn-ghost bee-btn-ghost--dashed"
          >
            {t("simulateToggle")}
          </button>
        </div>
      </div>

      {/* Formulario de simulación */}
      {showSimulate && (
        <form onSubmit={handleSimulate} className="rounded-lg border border-dashed border-border bg-[var(--color-primary)] p-4 space-y-3">
          <p className="bee-eyebrow">{t("simulateFormTitle")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input
              value={simDomain}
              onChange={(e) => setSimDomain(e.target.value)}
              placeholder={t("domainPlaceholder")}
              className="col-span-1 rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
              required
            />
            <select
              value={simSignalType}
              onChange={(e) => setSimSignalType(e.target.value)}
              className="col-span-1 rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)] bg-[var(--color-card)]"
            >
              {SIGNAL_TYPES.map((signalType) => (
                <option key={signalType} value={signalType}>{signalType.replace(/_/g, " ")}</option>
              ))}
            </select>
            <input
              value={simKeywords}
              onChange={(e) => setSimKeywords(e.target.value)}
              placeholder={t("keywordsPlaceholder")}
              className="col-span-1 rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
            />
          </div>
          <button type="submit" disabled={simLoading} className="bee-btn bee-btn--primary">
            {simLoading ? t("submitting") : t("submit")}
          </button>
        </form>
      )}

      {/* Grilla de leads calientes */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bee-bento bee-bento-pad py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("emptyTitle")}</p>
          <p className="bee-caption mt-1">{t("emptySubtitle")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((lead) => (
            <HotLeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}
