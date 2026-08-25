import { Activity, ArrowDownToLine, CheckCircle2, Radio, Sparkles, Target } from "lucide-react";

/**
 * MarketingPreview — vista previa estática del panel Control para la landing
 * pública. No es una captura real ni un componente conectado a datos: la
 * página pública no tiene sesión, así que reutilizar SignalStream/SignalHexMap
 * tal cual rompería (fetch sin auth, loading infinito). En su lugar, esto
 * replica la MISMA retícula y las mismas clases de diseño (.bee-bento,
 * .bee-eyebrow, tokens de color) con contenido de ejemplo fijo — mismo look,
 * cero riesgo de mostrar un error o un estado vacío a un visitante.
 * Etiquetado como ilustrativo, nunca presentado como dato real.
 */

const SIGNAL_FEED = [
  { icon: Radio, label: "Webhook recibido", title: "Northwind Robotics levantó una Serie C de USD 40M", time: "hace 2h" },
  { icon: ArrowDownToLine, label: "Enriquecida", title: "Vantage Health está contratando 20 AEs", time: "hace 5h" },
  { icon: Sparkles, label: "Estrategia lista", title: "Solace Data nombró un nuevo CRO", time: "hace 1d" },
] as const;

const KPI_TILES = [
  { label: "Ingesta", value: "Activo" },
  { label: "Cola", value: "3" },
  { label: "Hechos", value: "128" },
  { label: "Errores", value: "0" },
] as const;

const ACTION_ZONE = [
  { label: "Detectadas", value: 4 },
  { label: "Listas", value: 7 },
  { label: "En progreso", value: 3 },
] as const;

export function MarketingPreview() {
  return (
    <div className="bee-glass overflow-hidden rounded-[var(--radius-lg)]">
      {/* Barra de ventana — puramente decorativa, comunica "esto es un panel de producto" de un vistazo. */}
      <div className="flex items-center gap-2 border-b border-[var(--color-divider)] px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[var(--color-chart-2)]/60" aria-hidden />
        <span className="size-2.5 rounded-full bg-[var(--color-chart-1)]/60" aria-hidden />
        <span className="size-2.5 rounded-full bg-[var(--color-chart-4)]/60" aria-hidden />
        <span className="bee-micro ml-3 rounded-sm bg-[var(--color-primary)]/60 px-2 py-0.5">
          app.bee.io/dashboard/control
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        {/* Zona de acción */}
        <div className="bee-bento bee-bento-pad space-y-2 sm:col-span-1">
          <p className="bee-eyebrow">Zona de acción</p>
          {ACTION_ZONE.map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-sm bg-[var(--color-primary)]/50 px-2.5 py-2">
              <span className="text-xs font-medium">{row.label}</span>
              <span className="text-xs font-semibold tabular-nums">{row.value}</span>
            </div>
          ))}
        </div>

        {/* Flujo de señales */}
        <div className="bee-bento bee-bento-pad space-y-2 sm:col-span-1">
          <p className="bee-eyebrow">Flujo de señales</p>
          <div className="space-y-2.5">
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

        {/* Inteligencia */}
        <div className="bee-bento bee-bento-pad space-y-2 sm:col-span-1">
          <p className="bee-eyebrow flex items-center gap-1.5">
            <Activity className="size-3" /> Inteligencia
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {KPI_TILES.map((kpi) => (
              <div key={kpi.label} className="rounded-sm bg-[var(--color-primary)]/50 px-2 py-1.5">
                <p className="bee-micro">{kpi.label}</p>
                <p className="text-sm font-semibold tabular-nums">{kpi.value}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 rounded-sm bg-[var(--color-chart-5)]/10 px-2 py-1.5 text-[var(--color-chart-5)]">
            <CheckCircle2 className="size-3 shrink-0" />
            <span className="bee-micro">3 estrategias listas para aprobar</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-t border-[var(--color-divider)] px-4 py-2">
        <Target className="size-3 text-[var(--color-text-muted)]" />
        <p className="bee-micro">Vista ilustrativa del panel Control — datos de ejemplo, no una cuenta real.</p>
      </div>
    </div>
  );
}
