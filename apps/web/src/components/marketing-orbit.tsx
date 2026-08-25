import { Radio, Share2, Sparkles, TrendingUp } from "lucide-react";

/**
 * MarketingOrbit — galería de tarjetas en arco (estilo coverflow) para el
 * hero público. Puramente CSS (rotate/translate por tarjeta, hover para
 * enderezar y elevar) — sin JS, sin librería de carrusel, así que no hay
 * estado que romper ni autoplay que pelee con el usuario. Cada tarjeta
 * representa un módulo real del producto (mismos 4 de la sección de
 * módulos más abajo), no un mockup separado inventado para la ocasión.
 */

const CARDS = [
  {
    icon: Radio,
    label: "Motor de señales",
    stat: "247",
    statLabel: "señales esta semana",
    accent: "var(--color-chart-4)",
    tilt: "-rotate-[10deg] translate-y-3 sm:translate-y-5",
  },
  {
    icon: Sparkles,
    label: "Brief del día",
    stat: "6",
    statLabel: "cuentas prioritarias hoy",
    accent: "var(--color-chart-2)",
    tilt: "-rotate-[3deg] -translate-y-2",
  },
  {
    icon: TrendingUp,
    label: "Simulador de ingresos",
    stat: "+18%",
    statLabel: "vs. escenario base",
    accent: "var(--color-chart-5)",
    tilt: "rotate-[3deg] -translate-y-2",
  },
  {
    icon: Share2,
    label: "Automatización",
    stat: "12",
    statLabel: "secuencias activas",
    accent: "var(--color-chart-6)",
    tilt: "rotate-[10deg] translate-y-3 sm:translate-y-5",
  },
] as const;

export function MarketingOrbit() {
  return (
    // overflow-x-auto scoped here (not on the hero section, which still
    // needs its own overflow-hidden to contain the blurred gradient blobs)
    // — below the sm breakpoint the fanned cards are wider than the
    // viewport, so without this they'd get silently clipped by the
    // section's own overflow-hidden instead of staying reachable.
    //
    // py-8 here isn't decorative spacing — per the CSS overflow spec, once
    // overflow-x is anything but visible, overflow-y computes to auto too
    // (never plain visible), even though only -x was set. The outer/tilted
    // cards' rotated+translated bounding box genuinely extends past their
    // own layout box, so without this padding that forced auto-y silently
    // clipped their bottom edge — this gives that overshoot room to live
    // inside the scrollable box instead of past its edge.
    <div className="overflow-x-auto px-4 py-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div
        className="mx-auto flex w-fit min-w-full items-end justify-center gap-3 sm:gap-4"
        style={{ perspective: "1400px" }}
        aria-hidden
      >
        {CARDS.map((card) => (
          <div
            key={card.label}
            className={`group w-32 shrink-0 origin-bottom transition-transform duration-300 ease-out hover:z-10 hover:-translate-y-2 hover:rotate-0 hover:scale-110 sm:w-40 ${card.tilt}`}
          >
            <div className="bee-glass rounded-[var(--radius-lg)] p-3.5 shadow-[0_20px_40px_-24px_rgba(34,34,34,0.35)] transition-shadow duration-300 group-hover:shadow-[0_28px_48px_-20px_rgba(34,34,34,0.4)] sm:p-4">
              <div
                className="flex size-8 items-center justify-center rounded-[var(--radius-md)] sm:size-9"
                style={{ background: `color-mix(in srgb, ${card.accent} 18%, white)`, color: card.accent }}
              >
                <card.icon className="size-4 stroke-[1.75]" />
              </div>
              <p className="mt-3 text-lg font-bold tabular-nums tracking-tight sm:text-xl" style={{ color: card.accent }}>
                {card.stat}
              </p>
              <p className="bee-micro mt-0.5 leading-tight">{card.statLabel}</p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {card.label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
