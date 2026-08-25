"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  CheckCircle2,
  Flame,
  Radio,
  Sparkles,
  TrendingUp,
} from "lucide-react";

/**
 * MarketingDemoPanel — vista previa estática y con pestañas del producto,
 * para la landing pública. Las tres vistas (Señales / Leads / Simulador)
 * son contenido fijo, no datos reales: la landing no tiene sesión, así que
 * reusar los componentes conectados del dashboard (SignalStream, LeadsTable,
 * RevenueSimulator) tal cual rompería (fetch sin auth, loading infinito).
 * Se replican la MISMA retícula y clases (.bee-bento, .bee-eyebrow, tokens
 * de color) que sus equivalentes reales para que un visitante que luego
 * inicie sesión reconozca exactamente lo que vio acá — y se etiqueta
 * explícitamente como ilustrativo, nunca como una captura genuina.
 */

const TABS = [
  { id: "signals", label: "Señales" },
  { id: "leads", label: "Leads" },
  { id: "forecast", label: "Simulador" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SIGNAL_FEED = [
  { icon: Radio, label: "Webhook recibido", title: "Northwind Robotics levantó una Serie C de USD 40M", time: "hace 2h" },
  { icon: ArrowDownToLine, label: "Enriquecida", title: "Vantage Health está contratando 20 AEs", time: "hace 5h" },
  { icon: Sparkles, label: "Estrategia lista", title: "Solace Data nombró un nuevo CRO", time: "hace 1d" },
] as const;

const LEADS = [
  { name: "Elena Cross", company: "Northwind Robotics", title: "VP Sales", score: 92, stage: "Listo para comprar" },
  { name: "Marcus Diaz", company: "Vantage Health", title: "Head of RevOps", score: 78, stage: "Decisión" },
  { name: "Priya Shah", company: "Solace Data", title: "CRO", score: 65, stage: "Consideración" },
  { name: "Tom Reyes", company: "Fielder Logistics", title: "Director of Ops", score: 41, stage: "Conocimiento" },
] as const;

const FORECAST_BARS = [
  { label: "Conservador", value: 58, accent: "var(--color-chart-6)" },
  { label: "Base", value: 76, accent: "var(--color-chart-4)" },
  { label: "Con IA activa", value: 94, accent: "var(--color-chart-5)" },
] as const;

function SignalsView() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="bee-bento bee-bento-pad space-y-2 sm:col-span-1">
        <p className="bee-eyebrow">Zona de acción</p>
        {[{ label: "Detectadas", value: 4 }, { label: "Listas", value: 7 }, { label: "En progreso", value: 3 }].map((row) => (
          <div key={row.label} className="flex items-center justify-between rounded-sm bg-[var(--color-primary)]/50 px-2.5 py-2">
            <span className="text-xs font-medium">{row.label}</span>
            <span className="text-xs font-semibold tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="bee-bento bee-bento-pad space-y-2.5 sm:col-span-2">
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
  );
}

function LeadsView() {
  return (
    <div className="bee-bento bee-bento-pad overflow-x-auto">
      <p className="bee-eyebrow mb-2">Leads priorizados por score</p>
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
                <span
                  className="inline-flex items-center gap-1 tabular-nums"
                  style={{ color: lead.score >= 80 ? "var(--color-chart-5)" : "var(--color-text)" }}
                >
                  {lead.score >= 80 && <Flame className="size-3" />}
                  {lead.score}
                </span>
              </td>
              <td className="py-2">
                <span className="bee-micro rounded-sm bg-[var(--color-primary)]/50 px-2 py-0.5">{lead.stage}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ForecastView() {
  const max = Math.max(...FORECAST_BARS.map((b) => b.value));
  return (
    <div className="bee-bento bee-bento-pad">
      <p className="bee-eyebrow">Simulador de ingresos — próximo trimestre</p>
      <div className="mt-4 flex items-end gap-6 px-2">
        {FORECAST_BARS.map((bar) => (
          <div key={bar.label} className="flex flex-1 flex-col items-center gap-2">
            <p className="text-sm font-semibold tabular-nums" style={{ color: bar.accent }}>
              ${bar.value}k
            </p>
            <div className="flex h-28 w-full items-end rounded-[var(--radius-md)] bg-[var(--color-primary)]/30">
              <div
                className="w-full rounded-[var(--radius-md)] transition-all"
                style={{ height: `${(bar.value / max) * 100}%`, background: bar.accent }}
              />
            </div>
            <p className="bee-micro text-center">{bar.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-1.5 rounded-sm bg-[var(--color-chart-5)]/10 px-2.5 py-1.5 text-[var(--color-chart-5)]">
        <TrendingUp className="size-3.5 shrink-0" />
        <span className="bee-micro">Proyección basada en intención de compra real, no en promedios genéricos.</span>
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
       * dashboard real. */}
      <div className="min-h-[260px] p-4 sm:p-5">
        <ActiveView />
      </div>

      <div className="flex items-center gap-1.5 border-t border-[var(--color-divider)] px-4 py-2 sm:px-5">
        <CheckCircle2 className="size-3 text-[var(--color-text-muted)]" />
        <p className="bee-micro">Vista ilustrativa — datos de ejemplo, no una cuenta real.</p>
      </div>
    </div>
  );
}
