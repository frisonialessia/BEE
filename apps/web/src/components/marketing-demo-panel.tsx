"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  BarChart3,
  CheckCircle2,
  Flame,
  Radio,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * MarketingDemoPanel — vista previa con pestañas del producto para la
 * landing pública, mucho más fiel a las páginas reales que replica que la
 * primera versión (que era 2 columnas genéricas). Sigue siendo contenido
 * fijo, no datos reales: la landing no tiene sesión, así que reusar los
 * componentes conectados del dashboard (SignalStream, LeadsDirectory,
 * RevenueSimulatorWidget) tal cual rompería (fetch sin auth). En cambio
 * se replican sus MISMAS clases (.bee-bar-track, .bee-stat-grid, Badge con
 * las mismas variantes/colores) para que un visitante que luego inicie
 * sesión reconozca exactamente lo que vio acá.
 */

const TABS = [
  { id: "signals", label: "Señales" },
  { id: "leads", label: "Leads" },
  { id: "forecast", label: "Simulador" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Señales: réplica compacta de las 3 columnas de Control ────────────────

const SIGNAL_FEED = [
  { icon: Radio, label: "Webhook recibido", title: "Northwind Robotics levantó una Serie C de USD 40M", time: "hace 2h" },
  { icon: ArrowDownToLine, label: "Enriquecida", title: "Vantage Health está contratando 20 AEs", time: "hace 5h" },
  { icon: Sparkles, label: "Estrategia lista", title: "Solace Data nombró un nuevo CRO", time: "hace 1d" },
] as const;

const ACTION_ZONE = [
  { label: "Detectadas", value: 4 },
  { label: "Listas", value: 7 },
  { label: "En progreso", value: 3 },
] as const;

const KPI_TILES = [
  { label: "Ingesta", value: "Activo" },
  { label: "Cola", value: "3" },
  { label: "Hechos", value: "128" },
  { label: "Errores", value: "0" },
] as const;

const PROVIDERS = [
  { name: "LinkedIn", status: "Modo simulado", quota: "100/100" },
  { name: "G2", status: "Modo simulado", quota: "60/60" },
] as const;

// Grilla de "temperatura de cierre" — mismo concepto que la Colmena de
// intención real (SignalHexMap), simplificado a bloques CSS estáticos en
// vez de un canvas hexbin: sin datos reales que dibujar en una landing sin
// sesión, esto comunica la misma idea (mapa de calor por intensidad) sin
// fingir ser el componente conectado.
const HEAT_ROW = [0.9, 0.6, 0.3, 0.7, 0.4, 0.85, 0.5, 0.2] as const;

function SignalsView() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="bee-bento bee-bento-pad space-y-2">
        <p className="bee-eyebrow">Zona de acción</p>
        {ACTION_ZONE.map((row) => (
          <div key={row.label} className="flex items-center justify-between rounded-sm bg-[var(--color-primary)]/50 px-2.5 py-2">
            <span className="text-xs font-medium">{row.label}</span>
            <span className="text-xs font-semibold tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="bee-bento bee-bento-pad space-y-3">
        <div>
          <p className="bee-eyebrow">Colmena de intención</p>
          <div className="mt-2 flex items-center gap-1">
            {HEAT_ROW.map((t, i) => (
              <span
                key={i}
                className="h-6 flex-1 rounded-sm"
                style={{ background: `color-mix(in srgb, var(--color-chart-2) ${Math.round(t * 100)}%, var(--color-chart-4) ${Math.round((1 - t) * 100)}%)`, opacity: 0.35 + t * 0.65 }}
              />
            ))}
          </div>
          <div className="mt-1 flex items-center justify-between bee-micro">
            <span>Frío</span>
            <span>Caliente</span>
          </div>
        </div>
        <div className="space-y-2.5 border-t border-[var(--color-divider)] pt-3">
          <p className="bee-eyebrow">Flujo de señales</p>
          {SIGNAL_FEED.map((event) => (
            <div key={event.title} className="flex gap-2">
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-chart-4)]">
                <event.icon className="size-3" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="bee-micro">{event.label}</p>
                <p className="line-clamp-2 text-xs leading-snug">{event.title}</p>
                <p className="bee-micro mt-0.5">{event.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bee-bento bee-bento-pad space-y-3">
        <p className="bee-eyebrow">Inteligencia</p>
        <div className="grid grid-cols-2 gap-1.5">
          {KPI_TILES.map((kpi) => (
            <div key={kpi.label} className="rounded-sm bg-[var(--color-primary)]/50 px-2 py-1.5">
              <p className="bee-kpi-tile__label">{kpi.label}</p>
              <p className="text-sm font-semibold tabular-nums">{kpi.value}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 border-t border-[var(--color-divider)] pt-3">
          <p className="bee-eyebrow">APIs externas</p>
          {PROVIDERS.map((p) => (
            <div key={p.name} className="flex items-center justify-between rounded-sm bg-[var(--color-primary)]/40 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[var(--color-text-muted)]/50" aria-hidden />
                <div>
                  <p className="text-xs font-medium leading-none">{p.name}</p>
                  <p className="bee-micro mt-0.5">{p.status}</p>
                </div>
              </div>
              <span className="bee-micro">{p.quota}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Leads: réplica de la tabla real (mismos Badge/variantes/columnas) ─────

const LEAD_STATUS_TABS = ["Todos", "Nuevo", "Calificado", "Convertido"] as const;

const LEADS = [
  { name: "Elena Cross", title: "VP Sales", company: "Northwind Robotics", score: 92, stage: "Listo para comprar" },
  { name: "Marcus Diaz", title: "Head of RevOps", company: "Vantage Health", score: 78, stage: "Decisión" },
  { name: "Priya Shah", title: "CRO", company: "Solace Data", score: 65, stage: "Consideración" },
  { name: "Tom Reyes", title: "Director of Ops", company: "Fielder Logistics", score: 41, stage: "Conocimiento" },
] as const;

function scoreVariant(score: number): "success" | "warning" | "secondary" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "secondary";
}

function LeadsView() {
  const [statusTab, setStatusTab] = useState<(typeof LEAD_STATUS_TABS)[number]>("Todos");

  return (
    <div className="bee-bento bee-bento-pad space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="bee-eyebrow">Leads priorizados por score</p>
        <div className="bee-filter-tabs">
          {LEAD_STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusTab(s)}
              className={`bee-filter-tab ${statusTab === s ? "bee-filter-tab--active" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-2 font-medium">Contacto</th>
              <th className="pb-2 font-medium">Empresa</th>
              <th className="pb-2 font-medium">Score</th>
              <th className="pb-2 font-medium">Etapa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {LEADS.map((lead) => (
              <tr key={lead.name}>
                <td className="py-2">
                  <p className="font-medium">{lead.name}</p>
                  <p className="bee-micro">{lead.title}</p>
                </td>
                <td className="py-2">{lead.company}</td>
                <td className="py-2">
                  <Badge variant={scoreVariant(lead.score)} className="font-mono">
                    {lead.score >= 80 && <Flame className="mr-0.5 size-2.5" />}
                    {lead.score}
                  </Badge>
                </td>
                <td className="py-2">
                  <Badge variant="outline">{lead.stage}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="bee-micro border-t border-[var(--color-divider)] pt-2">4 de 128 leads · ordenado por score</p>
    </div>
  );
}

// ── Simulador: réplica del widget real, con el multiplicador interactivo ──

const SCENARIOS = [
  { label: "Conservador", base: 12, bar: "bee-bar--3" },
  { label: "Realista", base: 18, bar: "bee-bar--4" },
  { label: "Optimista", base: 26, bar: "bee-bar--1" },
] as const;

function ForecastView() {
  const [factor, setFactor] = useState(2);

  // Recalcula al mover el slider — la única pieza genuinamente interactiva
  // del panel de demo. La fórmula es una aproximación ilustrativa (no una
  // simulación real conectada al backend), pero mover el control SÍ mueve
  // las barras — no es un mockup congelado.
  const scenarios = useMemo(
    () => SCENARIOS.map((s) => ({ ...s, deals: Math.round(s.base * (factor / 2)) })),
    [factor],
  );
  const maxDeals = Math.max(...scenarios.map((s) => s.deals), 1);
  const realistic = scenarios.find((s) => s.label === "Realista");

  return (
    <div className="bee-bento bee-bento--warm bee-bento-pad space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <BarChart3 className="size-4 stroke-[1.25] text-[var(--color-chart-3)]" />
            Simulador de ingresos
          </h3>
          <p className="bee-caption mt-0.5">Proyecta el impacto de aumentar la prospección en un segmento</p>
        </div>
        <span className="bee-eyebrow">Confianza alta</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="bee-kpi-tile__label">Señal</label>
          <select className="bee-input" disabled defaultValue="funding_round">
            <option value="funding_round">Ronda de financiación</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="bee-kpi-tile__label">Industria</label>
          <input type="text" className="bee-input" disabled placeholder="p. ej. SaaS" />
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

      <div className="bee-bento bee-bento--primary bee-bento-pad space-y-2">
        <div className="flex items-center justify-between">
          <span className="bee-kpi-tile__label">Proyección realista</span>
          <span className="bee-kpi text-xl">
            {realistic?.deals ?? 0}
            <span className="ml-1 text-xs font-normal text-muted-foreground">operaciones</span>
          </span>
        </div>
        <p className="text-xs leading-relaxed">
          Subir la prospección {factor}× en este segmento sostiene el ritmo actual de cierre sin saturar al equipo.
        </p>
      </div>

      <div className="space-y-2">
        {scenarios.map((s) => {
          const pct = Math.round((s.deals / maxDeals) * 100);
          return (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="w-24 text-muted-foreground">{s.label}</span>
                <span className="font-semibold tabular-nums">{s.deals} operaciones</span>
              </div>
              <div className="bee-bar-track">
                <div className={`bee-bar ${s.bar} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bee-stat-grid">
        <div className="bee-stat">
          <div className="bee-stat__val">68%</div>
          <div className="bee-stat__lbl">Tasa de éxito</div>
        </div>
        <div className="bee-stat">
          <div className="bee-stat__val">54</div>
          <div className="bee-stat__lbl">Pipeline</div>
        </div>
        <div className="bee-stat">
          <div className="bee-stat__val">312</div>
          <div className="bee-stat__lbl">Puntos de datos</div>
        </div>
      </div>
    </div>
  );
}

const VIEWS: Record<TabId, () => React.ReactElement> = {
  signals: SignalsView,
  leads: LeadsView,
  forecast: ForecastView,
};

export function MarketingDemoPanel() {
  const [tab, setTab] = useState<TabId>("signals");
  const ActiveView = VIEWS[tab];

  return (
    <div className="bee-glass overflow-hidden rounded-[var(--radius-lg)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[var(--color-chart-2)]/60" aria-hidden />
          <span className="size-2.5 rounded-full bg-[var(--color-chart-1)]/60" aria-hidden />
          <span className="size-2.5 rounded-full bg-[var(--color-chart-4)]/60" aria-hidden />
          <span className="bee-micro ml-2 hidden rounded-sm bg-[var(--color-primary)]/60 px-2 py-0.5 sm:inline">
            app.bee.io/dashboard
          </span>
        </div>
        <div className="bee-filter-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`bee-filter-tab ${tab === t.id ? "bee-filter-tab--active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* min-h evita que el panel salte de alto al cambiar de pestaña —
       * mismo principio que DeepLearningPanel/ResiliencePanel en el
       * dashboard real. Calibrado al alto de la pestaña Señales, la más
       * alta de las tres. */}
      <div className="min-h-[420px] p-4 sm:p-5">
        <ActiveView />
      </div>

      <div className="flex items-center gap-1.5 border-t border-[var(--color-divider)] px-4 py-2 sm:px-5">
        <CheckCircle2 className="size-3 text-[var(--color-text-muted)]" />
        <p className="bee-micro">Vista ilustrativa — datos de ejemplo, no una cuenta real.</p>
      </div>
    </div>
  );
}
