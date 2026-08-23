"use client";

import { useState } from "react";
import {
  AlertCircle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from "lucide-react";

import { runRevenueSimulation } from "@/lib/api";
import { CHART_PALETTE } from "@/lib/brand/colors";
import type { RevenueSimulation, SimulatorScenario } from "@/lib/types";

const SIGNAL_TYPES = [
  { value: "funding_round", label: "Ronda de financiación" },
  { value: "hiring", label: "Aumento de contrataciones" },
  { value: "leadership_change", label: "Cambio de liderazgo" },
  { value: "tech_adoption", label: "Adopción tecnológica" },
  { value: "product_launch", label: "Lanzamiento de producto" },
  { value: "expansion", label: "Expansión" },
];

const CONFIDENCE_LABEL: Record<string, string> = {
  none: "Sin datos aún",
  low: "Confianza baja",
  medium: "Confianza media",
  high: "Confianza alta",
};

const SCENARIO_BAR: Record<string, string> = {
  Conservative: "bee-bar--3",
  Realistic: "bee-bar--4",
  Optimistic: "bee-bar--1",
};

function ScenarioBar({
  scenario,
  maxDeals,
}: {
  scenario: SimulatorScenario;
  maxDeals: number;
}) {
  const pct =
    maxDeals > 0 ? Math.round((scenario.projected_won_deals / maxDeals) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="w-24 text-muted-foreground">{scenario.label}</span>
        <span className="font-semibold">{scenario.projected_won_deals} operaciones</span>
        {scenario.uplift_vs_baseline > 0 && (
          <span className="text-[10px] text-muted-foreground">
            +{scenario.uplift_vs_baseline} vs línea base
          </span>
        )}
      </div>
      <div className="bee-bar-track">
        <div
          className={`bee-bar ${SCENARIO_BAR[scenario.label] ?? "bee-bar--2"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function RevenueSimulatorWidget() {
  const [signalType, setSignalType] = useState("funding_round");
  const [industry, setIndustry] = useState("");
  const [factor, setFactor] = useState(2);
  const [result, setResult] = useState<RevenueSimulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const res = await runRevenueSimulation({
        signal_type: signalType,
        industry: industry || undefined,
        increase_factor: factor,
      });
      if (res.live && res.data) {
        setResult(res.data);
      } else {
        setError("No se pudo conectar con la API de BEE. Asegúrate de que el backend esté en ejecución.");
      }
    } catch {
      setError("La simulación falló. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const maxDeals = result
    ? Math.max(...result.scenarios.map((s) => s.projected_won_deals), 1)
    : 1;
  const realistic = result?.scenarios.find((s) => s.label === "Realistic");

  return (
    <div className="bee-bento bee-bento--warm bee-bento-pad space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <BarChart3 className="size-4 stroke-[1.25]" style={{ color: CHART_PALETTE[3] }} />
            Simulador de ingresos
          </h3>
          <p className="bee-caption mt-0.5">
            Proyecta el impacto de aumentar la prospección en un segmento
          </p>
        </div>
        {result && (
          <span className="bee-eyebrow">{CONFIDENCE_LABEL[result.data_confidence]}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="bee-kpi-tile__label">Señal</label>
          <select
            value={signalType}
            onChange={(e) => setSignalType(e.target.value)}
            className="bee-input"
          >
            {SIGNAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="bee-kpi-tile__label">Industria</label>
          <input
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="p. ej. SaaS"
            className="bee-input"
          />
        </div>

        <div className="space-y-1">
          <label className="bee-kpi-tile__label">Multiplicador ({factor}×)</label>
          <input
            type="range"
            min={1.5}
            max={5}
            step={0.5}
            value={factor}
            onChange={(e) => setFactor(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--color-chart-4)]"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={loading}
        className="bee-btn bee-btn--primary w-full"
      >
        {loading ? "Simulando…" : `Simular prospección ${factor}×`}
      </button>

      {error && (
        <div className="flex items-center gap-2 border border-border bg-background px-3 py-2 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="bee-bento bee-bento--primary bee-bento-pad space-y-2">
            <div className="flex items-center justify-between">
              <span className="bee-kpi-tile__label">Proyección realista</span>
              <span className="bee-kpi text-xl">
                {realistic?.projected_won_deals ?? 0}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  operaciones
                </span>
              </span>
            </div>
            <p className="text-xs leading-relaxed">{result.recommendation}</p>
            {result.top_playbook && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <TrendingUp className="size-3" style={{ color: CHART_PALETTE[4] }} />
                Táctica principal: <span className="text-foreground">{result.top_playbook}</span>
                {result.top_channel && (
                  <>
                    {" "}
                    vía <span className="text-foreground">{result.top_channel}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {result.scenarios.map((s) => (
              <ScenarioBar key={s.label} scenario={s} maxDeals={maxDeals} />
            ))}
          </div>

          <div className="bee-stat-grid">
            <div className="bee-stat">
              <div className="bee-stat__val">
                {Math.round(result.historical_win_rate * 100)}%
              </div>
              <div className="bee-stat__lbl">Tasa de éxito</div>
            </div>
            <div className="bee-stat">
              <div className="bee-stat__val">{result.current_pipeline_count}</div>
              <div className="bee-stat__lbl">Pipeline</div>
            </div>
            <div className="bee-stat">
              <div className="bee-stat__val">{result.sample_size}</div>
              <div className="bee-stat__lbl">Puntos de datos</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showDetails ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
            {showDetails ? "Ocultar" : "Mostrar"} metodología
          </button>
          {showDetails && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {result.disclaimer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
