"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import type { DarkFunnelSummary, HotLeadScore } from "@/lib/types";
import { getDarkFunnelHotLeads, getDarkFunnelSummary, ingestDarkFunnelSignal } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/locales";

// BEE's palette has no red — the heat gradient (hottest → coolest) maps onto
// the chart accents instead: magenta (5, "hot"/success everywhere else in
// the app) → amber (1) → gold (3) → blue (4). ready_to_buy used to be
// chart-2/orange — the same hue as --destructive — so the best possible
// buying stage read as an error.
const STAGE_CONFIG: Record<string, { label: string; varColor: string }> = {
  ready_to_buy: { label: "Listo para comprar", varColor: "var(--color-chart-5)" },
  decision: { label: "Decisión", varColor: "var(--color-chart-1)" },
  consideration: { label: "Consideración", varColor: "var(--color-chart-3)" },
  awareness: { label: "Conocimiento", varColor: "var(--color-chart-4)" },
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

function ScoreBar({ score }: { score: number }) {
  const varColor =
    score >= 80
      ? "var(--color-chart-5)"
      : score >= 55
        ? "var(--color-chart-1)"
        : score >= 30
          ? "var(--color-chart-3)"
          : "var(--color-chart-4)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[var(--color-primary)] rounded-sm overflow-hidden">
        <div
          className="h-2 rounded-sm transition-all"
          style={{ width: `${Math.min(100, score)}%`, background: varColor }}
        />
      </div>
      <span className="text-xs font-mono font-bold text-foreground w-8 text-right">{score.toFixed(0)}</span>
    </div>
  );
}

function HotLeadCard({ lead }: { lead: HotLeadScore }) {
  const locale = useLocale() as Locale;
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
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold"
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
                CALIENTE
              </span>
            )}
            <span className="text-sm font-semibold truncate">
              {lead.company_name ?? lead.company_domain}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{lead.company_domain}</p>
        </div>
        <span
          className="shrink-0 rounded-sm border px-2 py-0.5 text-xs font-medium"
          style={{
            color: stage.varColor,
            borderColor: stage.varColor,
            background: `color-mix(in srgb, ${stage.varColor} 15%, var(--color-background))`,
          }}
        >
          {stage.label}
        </span>
      </div>

      <ScoreBar score={lead.research_intensity_score} />

      <div className="flex flex-wrap gap-1">
        {lead.signal_types_seen.slice(0, 4).map((t) => (
          <span key={t} className="text-xs bg-[var(--color-primary)] text-muted-foreground px-2 py-0.5 rounded-md">
            {t.replace(/_/g, " ")}
          </span>
        ))}
        {lead.signal_types_seen.length > 4 && (
          <span className="text-xs text-muted-foreground">+{lead.signal_types_seen.length - 4} más</span>
        )}
      </div>

      {lead.top_intent_keywords.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Intención: </span>
          {lead.top_intent_keywords.slice(0, 4).join(", ")}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{lead.signal_count} señal{lead.signal_count !== 1 ? "es" : ""}</span>
        {lead.last_signal_at && (
          <span>Última: {formatDate(lead.last_signal_at, locale)}</span>
        )}
      </div>
    </div>
  );
}

export function DarkFunnelDashboard() {
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Same stage colors as STAGE_CONFIG above — this tile row used to
              paint 'Leads calientes' orange (== --destructive) and 'Etapa
              de decisión' gold instead of STAGE_CONFIG's amber, so the same
              stage read as a different color depending on which part of
              this dashboard you looked at. */}
          {[
            { label: "Leads calientes", value: summary.total_hot_leads, accent: "var(--color-chart-5)" },
            { label: "Listos para comprar", value: summary.ready_to_buy_count, accent: "var(--color-chart-5)" },
            { label: "Etapa de decisión", value: summary.decision_stage_count, accent: "var(--color-chart-1)" },
            { label: "Señales de hoy", value: summary.total_signals_today, accent: "var(--color-chart-4)" },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bee-bento p-3 text-center">
              <p className="bee-stat__val" style={{ color: accent }}>{value}</p>
              <p className="bee-stat__lbl">{label}</p>
            </div>
          ))}
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
              {stage === "" ? "Todas" : STAGE_CONFIG[stage]?.label ?? stage}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={live ? "success" : "warning"}>{live ? "En vivo" : "Datos demo"}</Badge>
          <button
            onClick={() => setShowSimulate((v) => !v)}
            className="bee-btn-ghost bee-btn-ghost--dashed"
          >
            + Simular señal
          </button>
        </div>
      </div>

      {/* Formulario de simulación */}
      {showSimulate && (
        <form onSubmit={handleSimulate} className="rounded-lg border border-dashed border-border bg-[var(--color-primary)] p-4 space-y-3">
          <p className="bee-eyebrow">Simular una señal de intención</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={simDomain}
              onChange={(e) => setSimDomain(e.target.value)}
              placeholder="dominio-empresa.com"
              className="col-span-1 rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
              required
            />
            <select
              value={simSignalType}
              onChange={(e) => setSimSignalType(e.target.value)}
              className="col-span-1 rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)] bg-[var(--color-card)]"
            >
              {SIGNAL_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
            <input
              value={simKeywords}
              onChange={(e) => setSimKeywords(e.target.value)}
              placeholder="palabras clave (separadas por coma)"
              className="col-span-1 rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
            />
          </div>
          <button type="submit" disabled={simLoading} className="bee-btn bee-btn--primary">
            {simLoading ? "Enviando…" : "Enviar señal"}
          </button>
        </form>
      )}

      {/* Grilla de leads calientes */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bee-bento bee-bento-pad py-12 text-center">
          <p className="text-sm text-muted-foreground">Todavía no hay señales de intención.</p>
          <p className="bee-caption mt-1">Usa el simulador de arriba para enviar una señal de prueba.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((lead) => (
            <HotLeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}
