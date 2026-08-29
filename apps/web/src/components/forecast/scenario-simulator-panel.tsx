"use client";

import { AlertTriangle, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { runScenario } from "@/lib/api";
import type { ScenarioResult, ScenarioVariant } from "@/lib/types";

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
  notation: "compact",
});

const SIGNAL_TYPES = [
  { value: "funding_round", label: "Ronda de financiación" },
  { value: "hiring_surge", label: "Aumento de contrataciones" },
  { value: "executive_change", label: "Cambio de liderazgo" },
  { value: "expansion", label: "Expansión" },
  { value: "product_launch", label: "Lanzamiento de producto" },
];

const CHANNELS = [
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "warm_intro", label: "Intro cálida" },
  { value: "twitter", label: "Twitter/X" },
];

const VARIANT_LABEL: Record<string, string> = {
  conservative: "Conservador",
  realistic: "Realista",
  optimistic: "Optimista",
};

const VARIANT_COLOR: Record<string, string> = {
  conservative: "var(--color-chart-2)",
  realistic: "var(--color-chart-4)",
  optimistic: "var(--success)",
};

function VariantCard({ variant }: { variant: ScenarioVariant }) {
  const color = VARIANT_COLOR[variant.label] ?? "var(--color-chart-4)";
  return (
    <div
      className="rounded-[var(--radius-md)] border p-3"
      style={{ borderColor: color, background: `color-mix(in srgb, ${color} 10%, var(--color-background))` }}
    >
      <p className="bee-eyebrow" style={{ color }}>{VARIANT_LABEL[variant.label] ?? variant.label}</p>
      <p className="bee-kpi-sm mt-1" style={{ color }}>
        {currency.format(variant.annual_revenue)}
      </p>
      <p className="bee-caption">{currency.format(variant.monthly_revenue)}/mes</p>
      <p className="bee-caption">{(variant.win_rate * 100).toFixed(1)}% de cierre</p>
    </div>
  );
}

/** Simulador de escenarios — proyección financiera "qué pasaría si" con
 *  datos históricos reales de FeedbackLoopService. Vivía enterrado en Voz de
 *  marca (junto a herramientas de brand voice sin ninguna relación); ahora
 *  vive en Pronóstico, que es donde alguien realmente lo busca. Reescrito
 *  para el sistema de diseño actual — el original era inglés/€ con estilos
 *  sueltos, de antes de que BEE tuviera una convención visual consistente. */
export function ScenarioSimulatorPanel() {
  const [sector, setSector] = useState("");
  const [signalType, setSignalType] = useState("funding_round");
  const [channel, setChannel] = useState("email");
  const [disc, setDisc] = useState("");
  const [monthlySignals, setMonthlySignals] = useState(10);
  const [heat, setHeat] = useState(0);
  const [reps, setReps] = useState(0);

  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleRun() {
    setLoading(true);
    setError(false);
    try {
      const r = await runScenario({
        sector: sector || undefined,
        signal_type: signalType || undefined,
        channel: channel || undefined,
        psychographic_style: disc || undefined,
        target_monthly_signals: monthlySignals,
        additional_prospecting_reps: reps,
        dark_funnel_heat: heat || undefined,
      });
      if (r.live && r.data) setResult(r.data);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const usedDefaultDealValue = result?.supporting_data.used_default_deal_value ?? false;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="bee-bento bee-bento-pad space-y-3">
          <p className="text-xs font-semibold">Parámetros del escenario</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="Industria (ej. fintech)"
              className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
            />
            <select
              value={signalType}
              onChange={(e) => setSignalType(e.target.value)}
              className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
            >
              {SIGNAL_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={disc}
              onChange={(e) => setDisc(e.target.value)}
              className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
            >
              <option value="">Cualquier estilo DISC</option>
              {["D", "I", "S", "C"].map((d) => (
                <option key={d} value={d}>
                  Estilo {d}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block bee-micro">
              Señales mensuales objetivo: {monthlySignals}
            </label>
            <input
              type="range"
              min={1}
              max={100}
              value={monthlySignals}
              onChange={(e) => setMonthlySignals(Number(e.target.value))}
              className="w-full accent-[var(--color-chart-4)]"
            />
            <label className="block bee-micro">
              Calor de Dark Funnel: {heat}
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={heat}
              onChange={(e) => setHeat(Number(e.target.value))}
              className="w-full accent-[var(--color-chart-4)]"
            />
            <label className="block bee-micro">Reps adicionales: {reps}</label>
            <input
              type="range"
              min={0}
              max={10}
              value={reps}
              onChange={(e) => setReps(Number(e.target.value))}
              className="w-full accent-[var(--color-chart-4)]"
            />
          </div>

          <button
            type="button"
            onClick={handleRun}
            disabled={loading}
            className="bee-btn bee-btn--primary w-full text-xs"
          >
            {loading ? "Simulando…" : "Correr escenario"}
          </button>
          {error && <p className="text-[11px] text-[var(--color-chart-2)]">No se pudo simular — intenta de nuevo.</p>}
        </div>
      </div>

      <div className="space-y-3">
        {!result ? (
          <div className="bee-bento bee-bento-pad flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <Sparkles className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Configura un escenario y corre la simulación.</p>
          </div>
        ) : (
          <>
            {!result.has_any_historical_data ? (
              <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-chart-2)] bg-[color-mix(in_srgb,var(--color-chart-2)_15%,var(--color-background))] p-2.5 text-[11px]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Sin historial de resultados en tu organización todavía — estas proyecciones son estimados
                genéricos de industria, no tu desempeño real. Registra tus primeros resultados (Ganado/Perdido)
                para desbloquear proyecciones basadas en tus propios datos.
              </div>
            ) : (
              result.low_data_confidence && (
                <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_15%,var(--color-background))] p-2.5 text-[11px]">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Confianza de datos baja — solo {result.historical_sample_size} resultado(s) histórico(s) para
                  este segmento. Las proyecciones tienen un margen de error amplio.
                </div>
              )
            )}
            {usedDefaultDealValue && (
              <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-[var(--color-primary)]/25 p-2.5 bee-micro">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                El valor de deal ({currency.format(result.avg_deal_value)}) es un estimado de industria — todavía
                no hay suficientes deals cerrados con monto real en este segmento. Agrega el monto al calificar
                cada oportunidad para que esta cifra sea la tuya.
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <VariantCard variant={result.conservative} />
              <VariantCard variant={result.realistic} />
              <VariantCard variant={result.optimistic} />
            </div>

            <div className="bee-bento bee-bento-pad space-y-2 text-xs">
              <p className="flex items-center gap-1.5 font-medium">
                <TrendingUp className="size-3.5" style={{ color: "var(--color-chart-4)" }} />
                Tasa de cierre efectiva: {(result.effective_win_rate * 100).toFixed(1)}%
                <span className="text-muted-foreground">(base {(result.base_win_rate * 100).toFixed(1)}%)</span>
              </p>
              {result.key_drivers.length > 0 && (
                <div>
                  <p className="mb-1 text-muted-foreground">Impulsores clave:</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {result.key_drivers.map((d, i) => (
                      <li key={i}>✓ {d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.recommended_actions.length > 0 && (
                <div>
                  <p className="mb-1 text-muted-foreground">Recomendado:</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {result.recommended_actions.map((a, i) => (
                      <li key={i}>→ {a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.risk_factors.length > 0 && (
                <div>
                  <p className="mb-1 text-muted-foreground">Riesgos:</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {result.risk_factors.map((r, i) => (
                      <li key={i}>
                        <Badge variant="warning" className="mr-1 text-[11px]">
                          !
                        </Badge>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
