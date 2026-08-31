"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Flame,
  Radio,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MarketingHoneycomb } from "@/components/marketing-honeycomb";

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

// Mismas 5 etapas que el Espacio de leads real (Control → LeadWorkspace,
// STAGE_LABEL_ES) — no una versión recortada solo para que quepa acá.
const ACTION_ZONE = [
  { label: "Detectadas", value: 4 },
  { label: "Enriqueciendo", value: 2 },
  { label: "Listas", value: 7 },
  { label: "En progreso", value: 3 },
  { label: "Cerradas", value: 5 },
] as const;

const NEXT_ACTION = {
  company: "Northwind Robotics",
  reason: "Levantó una Serie C de USD 40M — el momento de mayor propensión a comprar.",
} as const;

const ZONE_ACTIVITY = [
  { text: "Aisha Bello pasó a Calificado", time: "hace 3h" },
  { text: "Tom Reyes fue asignado a un AE", time: "hace 6h" },
] as const;

// Mismo patrón que stageStats en SignalHexMap real (barra de color + %),
// solo que con datos de ejemplo fijos en vez de calculados de useHiveLeads.
const STAGE_STATS = [
  { label: "Listo para comprar", pct: 28, color: "var(--color-chart-2)" },
  { label: "Decisión", pct: 34, color: "var(--color-chart-1)" },
  { label: "Consideración", pct: 38, color: "var(--color-chart-3)" },
] as const;

const KPI_TILES = [
  { label: "Ingesta", value: "Activo" },
  { label: "Cola", value: "3" },
  { label: "Hechos", value: "128" },
  { label: "Errores", value: "0" },
  { label: "Latencia", value: "180ms" },
  { label: "Fuentes activas", value: "5" },
] as const;

const PROVIDERS = [
  { name: "LinkedIn", status: "Modo simulado", quota: "100/100" },
  { name: "G2", status: "Modo simulado", quota: "60/60" },
  { name: "Google Search", status: "Modo simulado", quota: "40/40" },
] as const;

function SignalsView() {
  return (
    <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
      {/* flex flex-col justify-between (no solo space-y) en las 3
       * columnas — el grid ya estira las 3 tarjetas a la altura de la
       * más alta (align-items: stretch por defecto), pero sin esto ese
       * espacio extra queda todo junto en un único hueco en blanco.
       * Agrupando el contenido en 3 bloques lógicos por columna y
       * repartiendo con justify-between, el espacio sobrante se reparte
       * entre los bloques en vez de acumularse en uno solo. */}
      <div className="bee-bento bee-bento-pad flex flex-col justify-between gap-3">
        <div className="space-y-2">
          <p className="bee-eyebrow">Zona de acción</p>
          {ACTION_ZONE.map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-sm bg-[var(--color-primary)]/50 px-2.5 py-2">
              <span className="text-xs font-medium">{row.label}</span>
              <span className="text-xs font-semibold tabular-nums">{row.value}</span>
            </div>
          ))}
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-chart-5)]">
            <Flame className="size-3" />
            3 leads calientes
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5 border-t border-[var(--color-divider)] pt-3">
          <div>
            <p className="bee-kpi-tile__label">Tiempo a 1ª acción</p>
            <p className="text-sm font-semibold tabular-nums">4.2h</p>
          </div>
          <div>
            <p className="bee-kpi-tile__label">Conversión de zona</p>
            <p className="text-sm font-semibold tabular-nums">24%</p>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-[var(--color-divider)] pt-3">
          <p className="bee-kpi-tile__label">Actividad reciente</p>
          {ZONE_ACTIVITY.map((a) => (
            <div key={a.text} className="flex items-center justify-between gap-2 text-xs">
              <span className="leading-snug">{a.text}</span>
              <span className="bee-micro shrink-0">{a.time}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 rounded-sm border border-dashed border-[var(--color-divider)] p-2.5">
          <p className="bee-kpi-tile__label">Próxima acción sugerida</p>
          <p className="text-xs font-medium leading-snug">{NEXT_ACTION.company}</p>
          <p className="bee-micro leading-snug">{NEXT_ACTION.reason}</p>
        </div>
      </div>

      <div className="bee-bento bee-bento-pad flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-center justify-between">
            <p className="bee-eyebrow">Colmena de intención</p>
            <div className="flex items-center gap-1.5 bee-micro">
              <span>Frío</span>
              <span
                className="h-1.5 w-10 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, var(--color-chart-1), var(--color-chart-2), var(--color-chart-3), var(--color-chart-4), var(--color-chart-6))",
                }}
              />
              <span>Caliente</span>
            </div>
          </div>
          <div className="mt-2 flex h-40 items-center justify-center">
            <MarketingHoneycomb />
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
                <p className="line-clamp-1 text-xs leading-snug">{event.title}</p>
                <p className="bee-micro mt-0.5">{event.time}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-[var(--color-divider)] pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {STAGE_STATS.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="h-5 w-[3px] shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                <div>
                  <p className="text-xs font-bold leading-none tabular-nums">{s.pct}%</p>
                  <p className="mt-0.5 text-[10px] leading-none text-muted-foreground">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-sm bg-[var(--color-primary)]/40 px-2.5 py-2">
            <span className="bee-kpi-tile__label">Señales hoy</span>
            <span className="text-xs font-semibold text-[var(--color-chart-4)]">24 detectadas · +6 nuevas</span>
          </div>
        </div>
      </div>

      <div className="bee-bento bee-bento-pad flex flex-col justify-between gap-3">
        <div className="space-y-3">
          <p className="bee-eyebrow">Inteligencia</p>
          <div className="grid grid-cols-2 gap-1.5">
            {KPI_TILES.map((kpi) => (
              <div key={kpi.label} className="rounded-sm bg-[var(--color-primary)]/50 px-2 py-1.5">
                <p className="bee-kpi-tile__label">{kpi.label}</p>
                <p className="text-sm font-semibold tabular-nums">{kpi.value}</p>
              </div>
            ))}
          </div>
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
        <div className="grid grid-cols-2 gap-1.5 border-t border-[var(--color-divider)] pt-3">
          <div>
            <p className="bee-kpi-tile__label">Última sincronización</p>
            <p className="text-sm font-semibold tabular-nums">hace 3 min</p>
          </div>
          <div>
            <p className="bee-kpi-tile__label">Próxima corrida</p>
            <p className="text-sm font-semibold tabular-nums">en 12 min</p>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-[var(--color-divider)] pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="bee-kpi-tile__label">Confianza del modelo</span>
            <span className="font-semibold tabular-nums">94%</span>
          </div>
          <div className="bee-bar-track">
            <div className="bee-bar bee-bar--4" style={{ width: "94%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Leads: réplica de la tabla real (mismos Badge/variantes/columnas) ─────

const LEAD_STATUS_TABS = ["Todos", "Nuevo", "Calificado", "Convertido"] as const;

const LEADS = [
  { name: "Elena Cross", title: "VP Sales", company: "Northwind Robotics", score: 92, stage: "Listo para comprar", status: "Convertido" },
  { name: "Marcus Diaz", title: "Head of RevOps", company: "Vantage Health", score: 78, stage: "Decisión", status: "Calificado" },
  { name: "Priya Shah", title: "CRO", company: "Solace Data", score: 65, stage: "Consideración", status: "Calificado" },
  { name: "Tom Reyes", title: "Director of Ops", company: "Fielder Logistics", score: 41, stage: "Conocimiento", status: "Nuevo" },
  { name: "Aisha Bello", title: "VP RevOps", company: "Bright Path Analytics", score: 58, stage: "Consideración", status: "Nuevo" },
  { name: "Diego Farro", title: "Head of Growth", company: "Anchor Freight", score: 88, stage: "Listo para comprar", status: "Convertido" },
] as const;

function scoreVariant(score: number): "success" | "warning" | "secondary" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "secondary";
}

// Distribución real por status sobre TODO el array (no el filtrado) — el
// resumen de abajo de la tabla, no otro número inventado.
const STATUS_COUNTS: Record<(typeof LEAD_STATUS_TABS)[number], number> = LEAD_STATUS_TABS.reduce(
  (acc, s) => ({ ...acc, [s]: s === "Todos" ? LEADS.length : LEADS.filter((l) => l.status === s).length }),
  {} as Record<(typeof LEAD_STATUS_TABS)[number], number>,
);

// Filtro + búsqueda REALES sobre el array de arriba, no solo una pestaña que
// cambia de color: esto es lo que hace que la pestaña sea "una herramienta
// para probar" y no una captura de pantalla interactiva a medias.
function LeadsView() {
  const [statusTab, setStatusTab] = useState<(typeof LEAD_STATUS_TABS)[number]>("Todos");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LEADS.filter((lead) => {
      const matchesStatus = statusTab === "Todos" || lead.status === statusTab;
      const matchesQuery =
        q.length === 0 ||
        lead.name.toLowerCase().includes(q) ||
        lead.company.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [statusTab, query]);

  const topLead = LEADS.reduce((best, l) => (l.score > best.score ? l : best), LEADS[0]);

  return (
    <div className="bee-bento bee-bento-pad flex flex-1 flex-col justify-between gap-3">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="bee-eyebrow">Leads priorizados por score</p>
          <div className="flex flex-wrap items-center gap-2">
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
            {/* w-32 en un <div> envolvente, no en el <input>: .bee-input fija
             * su propio width:100% como CSS sin capa (fuera de @layer), y una
             * regla sin capa siempre gana sobre una utilidad de Tailwind —
             * que sí vive dentro de @layer utilities. Puesto directo en el
             * input, w-32 quedaba anulado y el input se estiraba a todo el
             * ancho disponible, empujando el resto a su propia fila. */}
            <div className="w-32">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="bee-input"
              />
            </div>
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
              {filtered.map((lead) => (
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    Ningún lead coincide con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="bee-micro">
          {filtered.length} de 128 leads · ordenado por score
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-sm border border-dashed border-[var(--color-divider)] p-2.5">
        <Flame className="size-4 shrink-0 text-[var(--color-chart-5)]" />
        <div className="min-w-0">
          <p className="bee-kpi-tile__label">Score más alto</p>
          <p className="text-xs font-medium leading-snug">
            {topLead.name} · {topLead.company}
          </p>
          <p className="bee-micro leading-snug">
            Score {topLead.score} · {topLead.stage} — prioridad de contacto hoy.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-divider)] pt-3">
        <span className="bee-kpi-tile__label">Distribución por estado</span>
        {(["Nuevo", "Calificado", "Convertido"] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="size-1.5 rounded-full"
              style={{ background: s === "Convertido" ? "var(--color-chart-2)" : s === "Calificado" ? "var(--color-chart-1)" : "var(--color-chart-4)" }}
              aria-hidden
            />
            <span className="text-muted-foreground">{s}</span>
            <span className="font-semibold tabular-nums">{STATUS_COUNTS[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Simulador: réplica del widget real, con el multiplicador interactivo ──

const SCENARIOS = [
  { label: "Conservador", base: 12, bar: "bee-bar--3" },
  { label: "Realista", base: 18, bar: "bee-bar--4" },
  { label: "Optimista", base: 26, bar: "bee-bar--1" },
] as const;

const MONTHS = ["Ago", "Sep", "Oct", "Nov", "Dic", "Ene"] as const;

/** Curva mensual de operaciones proyectadas para el escenario realista, a
 *  partir del multiplicador — una rampa suave (no lineal) hasta el valor
 *  final, para que la tendencia se vea como una proyección real y no una
 *  recta artificial. */
function buildTrend(finalValue: number): number[] {
  return MONTHS.map((_, i) => {
    const t = (i + 1) / MONTHS.length;
    const eased = t * t * (3 - 2 * t); // smoothstep — arranque y cierre suaves
    return Math.round(finalValue * 0.35 + finalValue * 0.65 * eased);
  });
}

function TrendChart({ values }: { values: number[] }) {
  const w = 100;
  const h = 100;
  const max = Math.max(...values, 1);
  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => [i * stepX, h - (v / max) * (h - 12) - 4]);
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-24 w-full overflow-visible">
        <defs>
          <linearGradient id="marketing-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-4)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-chart-4)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#marketing-trend-fill)" className="transition-all duration-500" />
        <path d={linePath} fill="none" stroke="var(--color-chart-4)" strokeWidth={2} vectorEffect="non-scaling-stroke" className="transition-all duration-500" />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.2} fill="var(--color-chart-4)" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between bee-micro">
        {MONTHS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}

function ForecastView() {
  const [factor, setFactor] = useState(2);
  const [running, setRunning] = useState(false);
  // Poblado desde el arranque (factor=2 por defecto) para que la pestaña
  // no se vea vacía hasta el primer clic — pero mover el slider por sí
  // solo NO recalcula nada: solo "Ejecutar simulación" lo hace, con una
  // breve carga, igual que el widget real (que sí llama a la API en
  // handleRun en vez de recalcular en cada pixel del drag).
  const [ranFactor, setRanFactor] = useState(2);

  const scenarios = useMemo(
    () => SCENARIOS.map((s) => ({ ...s, deals: Math.round(s.base * (ranFactor / 2)) })),
    [ranFactor],
  );
  const maxDeals = Math.max(...scenarios.map((s) => s.deals), 1);
  const realistic = scenarios.find((s) => s.label === "Realista");
  const trend = useMemo(() => buildTrend(realistic?.deals ?? 0), [realistic]);

  function handleRun() {
    setRunning(true);
    setTimeout(() => {
      setRanFactor(factor);
      setRunning(false);
    }, 650);
  }

  return (
    <div className="bee-bento bee-bento--warm bee-bento-pad flex flex-1 flex-col justify-between gap-4">
      <div className="space-y-4">
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
  
        <button type="button" onClick={handleRun} disabled={running} className="bee-btn bee-btn--primary w-full">
          {running ? "Simulando…" : `Ejecutar simulación ${factor}×`}
        </button>
  
        {/* Proyección + tendencia a la izquierda, escenarios + stats a la
         * derecha — en 2 columnas en vez de todo apilado, para que esta
         * pestaña converja a una altura parecida a Señales/Leads en vez de
         * quedar mucho más alta y hacer saltar el panel al cambiar de tab. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="bee-bento bee-bento--primary bee-bento-pad space-y-2">
            <div className="flex items-center justify-between">
              <span className="bee-kpi-tile__label">Proyección realista</span>
              <span className="bee-kpi">
                {realistic?.deals ?? 0}
                <span className="ml-1 text-xs font-normal text-muted-foreground">operaciones</span>
              </span>
            </div>
            <p className="text-xs leading-relaxed">
              Subir la prospección {ranFactor}× en este segmento sostiene el ritmo actual de cierre sin saturar al equipo.
            </p>
            <TrendChart values={trend} />
          </div>
  
          <div className="space-y-3">
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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 border-t border-[var(--color-divider)] pt-3 sm:grid-cols-3">
        <div>
          <p className="bee-kpi-tile__label">Ciclo de venta promedio</p>
          <p className="text-sm font-semibold tabular-nums">34 días</p>
        </div>
        <div>
          <p className="bee-kpi-tile__label">Ticket promedio</p>
          <p className="text-sm font-semibold tabular-nums">USD 18.400</p>
        </div>
        <div>
          <p className="bee-kpi-tile__label">Próxima actualización</p>
          <p className="text-sm font-semibold tabular-nums">en 24h</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-divider)] pt-3 text-[11px] text-muted-foreground">
        <span>Basado en 312 puntos de intención de compra de los últimos 90 días.</span>
        <Link
          href="/funcionalidades#simulador"
          className="inline-flex shrink-0 items-center gap-1 font-medium text-[var(--color-chart-4)] hover:underline"
        >
          Ver más <ArrowUpRight className="size-3" />
        </Link>
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
       * dashboard real. Calibrado al contenido real de Simulador (~619px
       * medido con Playwright, clonando el nodo con min-height:0 para
       * leer su alto natural), la pestaña más alta de las tres — no un
       * valor a ojo, y recalibrado cada vez que el contenido de alguna
       * pestaña cambia.
       *
       * flex flex-col acá + flex-1 en la raíz de cada vista: sin esto,
       * min-h solo agranda ESTE contenedor — el contenido de la vista
       * (que es block-level) no lo llena, y queda una franja vacía entre
       * el final del contenido real y el borde inferior de la tarjeta.
       * Con flex-1 la vista ocupa toda la altura disponible de verdad, y
       * cada vista ancla su último bloque con mt-auto (mismo patrón que
       * "Próxima acción sugerida" en Zona de acción) para que ese espacio
       * termine con información real, no un padding decorativo. */}
      <div className="flex min-h-[620px] flex-col p-4 sm:p-5">
        <ActiveView />
      </div>

      <div className="flex items-center gap-1.5 border-t border-[var(--color-divider)] px-4 py-2 sm:px-5">
        <CheckCircle2 className="size-3 text-[var(--color-text-muted)]" />
        <p className="bee-micro">Vista ilustrativa — datos de ejemplo, no una cuenta real.</p>
      </div>
    </div>
  );
}
