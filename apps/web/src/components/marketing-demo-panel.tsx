"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
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
import { prefersReducedMotion, useInView } from "@/components/marketing-motion";
import { scoreVariant } from "@/lib/format";

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
 *
 * Todos los textos de las 3 pestañas viven en landing.demo.* — los datos
 * fijos (nombres propios, scores, porcentajes) se quedan en los arrays de
 * este archivo, referenciados por `id` estable, y `useTranslations`
 * resuelve la copia por ese id — ver el patrón ya usado en
 * marketing-honeycomb.tsx para `stage`.
 */

const TABS = [
  { id: "signals" },
  { id: "leads" },
  { id: "forecast" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Señales: réplica compacta de las 3 columnas de Control ────────────────

const SIGNAL_FEED = [
  { id: "webhook", icon: Radio },
  { id: "enriched", icon: ArrowDownToLine },
  { id: "strategy", icon: Sparkles },
] as const;

// Mismas 5 etapas que el Espacio de leads real (Control → LeadWorkspace,
// STAGE_LABEL_ES) — no una versión recortada solo para que quepa acá.
const ACTION_ZONE = [
  { id: "detected", value: 4 },
  { id: "enriching", value: 2 },
  { id: "ready", value: 7 },
  { id: "inProgress", value: 3 },
  { id: "closed", value: 5 },
] as const;

const NEXT_ACTION = { company: "Northwind Robotics" } as const;

const ZONE_ACTIVITY = [{ id: "qualified" }, { id: "assigned" }] as const;

// Mismo patrón que stageStats en SignalHexMap real (barra de color + %),
// solo que con datos de ejemplo fijos en vez de calculados de useHiveLeads.
// `id` referencia landing.stages (misma fuente que marketing-honeycomb.tsx).
const STAGE_STATS = [
  { id: "ready_to_buy", pct: 28, color: "var(--color-chart-2)" },
  { id: "decision", pct: 34, color: "var(--color-chart-1)" },
  { id: "consideration", pct: 38, color: "var(--color-chart-3)" },
] as const;

const KPI_TILES = [
  { id: "ingestion", value: null },
  { id: "queue", value: "3" },
  { id: "facts", value: "128" },
  { id: "errors", value: "0" },
  { id: "latency", value: "180ms" },
  { id: "activeSources", value: "5" },
] as const;

const PROVIDERS = [
  { name: "LinkedIn", quota: "100/100" },
  { name: "G2", quota: "60/60" },
  { name: "Google Search", quota: "40/40" },
] as const;

function SignalsView() {
  const t = useTranslations("landing.demo.signalsView");
  const tStages = useTranslations("landing.stages");

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
          <p className="bee-eyebrow">{t("actionZoneTitle")}</p>
          {ACTION_ZONE.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-sm bg-[var(--color-primary)]/50 px-2.5 py-2">
              <span className="text-xs font-medium">{t(`actionZone.${row.id}`)}</span>
              <span className="text-xs font-semibold tabular-nums">{row.value}</span>
            </div>
          ))}
          <p className="flex items-center gap-1.5 text-micro text-[var(--color-chart-5)]">
            <Flame className="size-3" />
            {t("hotLeads", { count: 3 })}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5 border-t border-[var(--color-divider)] pt-3">
          <div>
            <p className="bee-kpi-tile__label">{t("timeToFirstAction")}</p>
            <p className="text-sm font-semibold tabular-nums">4.2h</p>
          </div>
          <div>
            <p className="bee-kpi-tile__label">{t("zoneConversion")}</p>
            <p className="text-sm font-semibold tabular-nums">24%</p>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-[var(--color-divider)] pt-3">
          <p className="bee-kpi-tile__label">{t("recentActivity")}</p>
          {ZONE_ACTIVITY.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="leading-snug">{t(`activity.${a.id}.text`)}</span>
              <span className="bee-micro shrink-0">{t(`activity.${a.id}.time`)}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 rounded-sm border border-dashed border-[var(--color-divider)] p-2.5">
          <p className="bee-kpi-tile__label">{t("nextActionLabel")}</p>
          <p className="text-xs font-medium leading-snug">{NEXT_ACTION.company}</p>
          <p className="bee-micro leading-snug">{t("nextActionReason")}</p>
        </div>
      </div>

      <div className="bee-bento bee-bento-pad flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-center justify-between">
            <p className="bee-eyebrow">{t("hiveTitle")}</p>
            <div className="flex items-center gap-1.5 bee-micro">
              <span>{t("cold")}</span>
              <span
                className="h-1.5 w-10 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, var(--color-chart-3), var(--color-chart-1), var(--color-chart-2), var(--color-chart-4), var(--color-chart-6), var(--color-chart-5))",
                }}
              />
              <span>{t("hot")}</span>
            </div>
          </div>
          <div className="mt-2 flex h-40 items-center justify-center">
            <MarketingHoneycomb />
          </div>
        </div>
        <div className="space-y-2.5 border-t border-[var(--color-divider)] pt-3">
          <p className="bee-eyebrow">{t("signalFlowTitle")}</p>
          {SIGNAL_FEED.map((event) => (
            <div key={event.id} className="flex gap-2">
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-chart-4)]">
                <event.icon className="size-3" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="bee-micro">{t(`feed.${event.id}.label`)}</p>
                <p className="line-clamp-1 text-xs leading-snug">{t(`feed.${event.id}.title`)}</p>
                <p className="bee-micro mt-0.5">{t(`feed.${event.id}.time`)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-[var(--color-divider)] pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {STAGE_STATS.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <span className="h-5 w-[3px] shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                <div>
                  <p className="text-xs font-bold leading-none tabular-nums">{s.pct}%</p>
                  <p className="mt-0.5 text-micro leading-none text-muted-foreground">{tStages(s.id)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-sm bg-[var(--color-primary)]/40 px-2.5 py-2">
            <span className="bee-kpi-tile__label">{t("signalsToday")}</span>
            <span className="text-xs font-semibold text-[var(--color-chart-4)]">
              {t("signalsTodayValue", { detected: 24, new: 6 })}
            </span>
          </div>
        </div>
      </div>

      <div className="bee-bento bee-bento-pad flex flex-col justify-between gap-3">
        <div className="space-y-3">
          <p className="bee-eyebrow">{t("intelligenceTitle")}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {KPI_TILES.map((kpi) => (
              <div key={kpi.id} className="rounded-sm bg-[var(--color-primary)]/50 px-2 py-1.5">
                <p className="bee-kpi-tile__label">{t(`kpis.${kpi.id}`)}</p>
                <p className="text-sm font-semibold tabular-nums">
                  {kpi.value ?? t("kpis.ingestionActive")}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 border-t border-[var(--color-divider)] pt-3">
          <p className="bee-eyebrow">{t("externalApis")}</p>
          {PROVIDERS.map((p) => (
            <div key={p.name} className="flex items-center justify-between rounded-sm bg-[var(--color-primary)]/40 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[var(--color-text-muted)]/50" aria-hidden />
                <div>
                  <p className="text-xs font-medium leading-none">{p.name}</p>
                  <p className="bee-micro mt-0.5">{t("simulatedMode")}</p>
                </div>
              </div>
              <span className="bee-micro">{p.quota}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5 border-t border-[var(--color-divider)] pt-3">
          <div>
            <p className="bee-kpi-tile__label">{t("lastSync")}</p>
            <p className="text-sm font-semibold tabular-nums">{t("lastSyncValue")}</p>
          </div>
          <div>
            <p className="bee-kpi-tile__label">{t("nextRun")}</p>
            <p className="text-sm font-semibold tabular-nums">{t("nextRunValue")}</p>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-[var(--color-divider)] pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="bee-kpi-tile__label">{t("modelConfidence")}</span>
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

const LEAD_STATUS_TABS = ["all", "new", "qualified", "converted"] as const;
type LeadStatusId = (typeof LEAD_STATUS_TABS)[number];

const LEADS = [
  { id: "elena", name: "Elena Cross", company: "Northwind Robotics", score: 92, stage: "ready_to_buy", status: "converted" },
  { id: "marcus", name: "Marcus Diaz", company: "Vantage Health", score: 78, stage: "decision", status: "qualified" },
  { id: "priya", name: "Priya Shah", company: "Solace Data", score: 65, stage: "consideration", status: "qualified" },
  { id: "tom", name: "Tom Reyes", company: "Fielder Logistics", score: 41, stage: "awareness", status: "new" },
  { id: "aisha", name: "Aisha Bello", company: "Bright Path Analytics", score: 58, stage: "consideration", status: "new" },
  { id: "diego", name: "Diego Farro", company: "Anchor Freight", score: 88, stage: "ready_to_buy", status: "converted" },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  company: string;
  score: number;
  stage: string;
  status: LeadStatusId;
}>;

// Distribución real por status sobre TODO el array (no el filtrado) — el
// resumen de abajo de la tabla, no otro número inventado.
const STATUS_COUNTS: Record<LeadStatusId, number> = LEAD_STATUS_TABS.reduce(
  (acc, s) => ({ ...acc, [s]: s === "all" ? LEADS.length : LEADS.filter((l) => l.status === s).length }),
  {} as Record<LeadStatusId, number>,
);

const LEADS_TOTAL = 128;

// Filtro + búsqueda REALES sobre el array de arriba, no solo una pestaña que
// cambia de color: esto es lo que hace que la pestaña sea "una herramienta
// para probar" y no una captura de pantalla interactiva a medias.
function LeadsView() {
  const t = useTranslations("landing.demo.leadsView");
  const tStages = useTranslations("landing.stages");
  const [statusTab, setStatusTab] = useState<LeadStatusId>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LEADS.filter((lead) => {
      const matchesStatus = statusTab === "all" || lead.status === statusTab;
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
          <p className="bee-eyebrow">{t("title")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="bee-filter-tabs">
              {LEAD_STATUS_TABS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusTab(s)}
                  className={`bee-filter-tab ${statusTab === s ? "bee-filter-tab--active" : ""}`}
                >
                  {t(`statusTabs.${s}`)}
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
                placeholder={t("searchPlaceholder")}
                className="bee-input"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pb-2 font-medium">{t("columns.contact")}</th>
                <th className="pb-2 font-medium">{t("columns.company")}</th>
                <th className="pb-2 font-medium">{t("columns.score")}</th>
                <th className="pb-2 font-medium">{t("columns.stage")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((lead) => (
                <tr key={lead.id}>
                  <td className="py-2">
                    <p className="font-medium">{lead.name}</p>
                    <p className="bee-micro">{t(`leads.${lead.id}.title`)}</p>
                  </td>
                  <td className="py-2">{lead.company}</td>
                  <td className="py-2">
                    <Badge variant={scoreVariant(lead.score)} className="font-mono">
                      {lead.score >= 80 && <Flame className="mr-0.5 size-2.5" />}
                      {lead.score}
                    </Badge>
                  </td>
                  <td className="py-2">
                    <Badge variant="outline">{tStages(lead.stage)}</Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    {t("emptyFiltered")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="bee-micro">{t("summary", { count: filtered.length, total: LEADS_TOTAL })}</p>
      </div>

      <div className="flex items-center gap-3 rounded-sm border border-dashed border-[var(--color-divider)] p-2.5">
        <Flame className="size-4 shrink-0 text-[var(--color-chart-5)]" />
        <div className="min-w-0">
          <p className="bee-kpi-tile__label">{t("topScoreLabel")}</p>
          <p className="text-xs font-medium leading-snug">
            {topLead.name} · {topLead.company}
          </p>
          <p className="bee-micro leading-snug">
            {t("topScoreDetail", { score: topLead.score, stage: tStages(topLead.stage) })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-divider)] pt-3">
        <span className="bee-kpi-tile__label">{t("statusDistribution")}</span>
        {(["new", "qualified", "converted"] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5 text-micro">
            <span
              className="size-1.5 rounded-full"
              style={{ background: s === "converted" ? "var(--color-chart-2)" : s === "qualified" ? "var(--color-chart-1)" : "var(--color-chart-4)" }}
              aria-hidden
            />
            <span className="text-muted-foreground">{t(`statusTabs.${s}`)}</span>
            <span className="font-semibold tabular-nums">{STATUS_COUNTS[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Simulador: réplica del widget real, con el multiplicador interactivo ──

const SCENARIOS = [
  { id: "conservative", base: 12, bar: "bee-bar--3" },
  { id: "realistic", base: 18, bar: "bee-bar--4" },
  { id: "optimistic", base: 26, bar: "bee-bar--1" },
] as const;

const MONTHS_COUNT = 6;

/** Curva mensual de operaciones proyectadas para el escenario realista, a
 *  partir del multiplicador — una rampa suave (no lineal) hasta el valor
 *  final, para que la tendencia se vea como una proyección real y no una
 *  recta artificial. */
function buildTrend(finalValue: number): number[] {
  return Array.from({ length: MONTHS_COUNT }, (_, i) => {
    const t = (i + 1) / MONTHS_COUNT;
    const eased = t * t * (3 - 2 * t); // smoothstep — arranque y cierre suaves
    return Math.round(finalValue * 0.35 + finalValue * 0.65 * eased);
  });
}

function TrendChart({ values, months }: { values: number[]; months: string[] }) {
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
        {months.map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </div>
    </div>
  );
}

function ForecastView() {
  const t = useTranslations("landing.demo.forecastView");
  const months = t.raw("months") as string[];
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
  const realistic = scenarios.find((s) => s.id === "realistic");
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
              {t("title")}
            </h3>
            <p className="bee-caption mt-0.5">{t("subtitle")}</p>
          </div>
          <span className="bee-eyebrow">{t("highConfidence")}</span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="bee-kpi-tile__label">{t("signalLabel")}</label>
            <select className="bee-input" disabled defaultValue="funding_round">
              <option value="funding_round">{t("fundingRound")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="bee-kpi-tile__label">{t("industryLabel")}</label>
            <input type="text" className="bee-input" disabled placeholder={t("industryPlaceholder")} />
          </div>
          <div className="space-y-1">
            <label className="bee-kpi-tile__label">{t("multiplierLabel", { factor })}</label>
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
          {running ? t("running") : t("runButton", { factor })}
        </button>

        {/* Proyección + tendencia a la izquierda, escenarios + stats a la
         * derecha — en 2 columnas en vez de todo apilado, para que esta
         * pestaña converja a una altura parecida a Señales/Leads en vez de
         * quedar mucho más alta y hacer saltar el panel al cambiar de tab. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="bee-bento bee-bento--primary bee-bento-pad space-y-2">
            <div className="flex items-center justify-between">
              <span className="bee-kpi-tile__label">{t("projectionLabel")}</span>
              <span className="bee-kpi">
                {realistic?.deals ?? 0}
                <span className="ml-1 text-xs font-normal text-muted-foreground">{t("operationsUnit")}</span>
              </span>
            </div>
            <p className="text-xs leading-relaxed">{t("projectionNote", { factor: ranFactor })}</p>
            <TrendChart values={trend} months={months} />
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              {scenarios.map((s) => {
                const pct = Math.round((s.deals / maxDeals) * 100);
                return (
                  <div key={s.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="w-24 text-muted-foreground">{t(`scenarios.${s.id}`)}</span>
                      <span className="font-semibold tabular-nums">{t("dealsCount", { count: s.deals })}</span>
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
                <div className="bee-stat__lbl">{t("successRate")}</div>
              </div>
              <div className="bee-stat">
                <div className="bee-stat__val">54</div>
                <div className="bee-stat__lbl">{t("pipeline")}</div>
              </div>
              <div className="bee-stat">
                <div className="bee-stat__val">312</div>
                <div className="bee-stat__lbl">{t("dataPoints")}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 border-t border-[var(--color-divider)] pt-3 sm:grid-cols-3">
        <div>
          <p className="bee-kpi-tile__label">{t("avgSalesCycle")}</p>
          <p className="text-sm font-semibold tabular-nums">{t("avgSalesCycleValue")}</p>
        </div>
        <div>
          <p className="bee-kpi-tile__label">{t("avgTicket")}</p>
          <p className="text-sm font-semibold tabular-nums">{t("avgTicketValue")}</p>
        </div>
        <div>
          <p className="bee-kpi-tile__label">{t("nextUpdate")}</p>
          <p className="text-sm font-semibold tabular-nums">{t("nextUpdateValue")}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-divider)] pt-3 text-micro text-muted-foreground">
        <span>{t("basedOn")}</span>
        <Link
          href="/funcionalidades#pronostico"
          className="inline-flex shrink-0 items-center gap-1 font-medium text-[var(--color-chart-4)] hover:underline"
        >
          {t("viewMore")} <ArrowUpRight className="size-3" />
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

// Tabs auto-rotate this often while the panel is on screen and untouched —
// slow enough to read a tab, not a slideshow.
const AUTO_ROTATE_MS = 8000;

export function MarketingDemoPanel() {
  const t = useTranslations("landing.demo");
  const [tab, setTab] = useState<TabId>("signals");
  // Auto-rotation: the three tabs cycle every 8 s so a visitor who only
  // scrolls still sees Señales, Leads and Simulador — but only while the
  // panel is actually in view (once: false — it resumes when scrolled back
  // to), never after the visitor has touched it (a click, a keypress, a
  // focus inside: from then on the panel is theirs), and never under
  // prefers-reduced-motion, where content swapping on its own is exactly
  // the kind of unrequested movement the setting asks to avoid.
  const [auto, setAuto] = useState(true);
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.35, once: false });
  const ActiveView = VIEWS[tab];

  useEffect(() => {
    if (!auto || !inView || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      setTab((current) => {
        const idx = TABS.findIndex((item) => item.id === current);
        return TABS[(idx + 1) % TABS.length].id;
      });
    }, AUTO_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [auto, inView]);

  const stopAuto = () => setAuto(false);
  const rotating = auto && inView;

  return (
    <div
      ref={ref}
      className="bee-glass overflow-hidden rounded-[var(--radius-lg)]"
      onPointerDownCapture={stopAuto}
      onKeyDownCapture={stopAuto}
      onFocusCapture={stopAuto}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[var(--color-green-1)]" aria-hidden />
          <span className="size-2.5 rounded-full bg-[var(--color-green-2)]" aria-hidden />
          <span className="size-2.5 rounded-full bg-[var(--color-green-3)]" aria-hidden />
          <span className="bee-micro ml-2 hidden rounded-sm bg-[var(--color-primary)]/60 px-2 py-0.5 sm:inline">
            app.bee.io/dashboard
          </span>
        </div>
        <div className="bee-filter-tabs">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={`bee-filter-tab relative overflow-hidden ${tab === tabItem.id ? "bee-filter-tab--active" : ""}`}
            >
              {t(`tabs.${tabItem.id}`)}
              {/* Honey hairline that fills across the active tab over the
               * 8 s until the next rotation — keyed on the tab so it
               * restarts with every switch; gone once the visitor takes
               * over. */}
              {rotating && tab === tabItem.id && (
                <span key={tab} className="bee-tab-progress" style={{ animationDuration: `${AUTO_ROTATE_MS}ms` }} aria-hidden />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* min-h evita que el panel salte de alto al cambiar de pestaña —
       * mismo principio que ResiliencePanel (y el antiguo DeepLearningPanel) en el
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
        <p className="bee-micro">{t("illustrativeNote")}</p>
      </div>
    </div>
  );
}
