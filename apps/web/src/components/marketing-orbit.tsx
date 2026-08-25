import { Radio, Share2, Sparkles, TrendingUp } from "lucide-react";

/**
 * MarketingOrbit — galería de tarjetas en arco (estilo coverflow) para el
 * hero público. Puramente CSS (rotate/translate por tarjeta, hover para
 * enderezar y elevar) — sin JS, sin librería de carrusel.
 *
 * Cada tarjeta es una propuesta de valor del módulo — no una cifra de la
 * app en vivo. Antes decían "247 señales esta semana" / "+18% vs.
 * escenario base": números que parecían salidos de una cuenta real y que
 * ningún visitante nuevo puede verificar. Un visitante que entra por
 * primera vez no tiene 247 señales de nada — mostrarle eso rompe la
 * confianza apenas la pisa. Esto describe lo que el módulo HACE, no lo
 * que una cuenta activa acumuló.
 */

const CARDS = [
  {
    icon: Radio,
    headline: "Detecta cada señal de mercado apenas ocurre",
    label: "Motor de señales",
    accent: "var(--color-chart-4)",
    tilt: "-rotate-[10deg] translate-y-3 sm:translate-y-5",
  },
  {
    icon: Sparkles,
    headline: "Tu resumen ejecutivo, listo cada mañana",
    label: "Brief del día",
    accent: "var(--color-chart-2)",
    tilt: "-rotate-[3deg] -translate-y-2",
  },
  {
    icon: TrendingUp,
    headline: "Proyecta escenarios sobre intención de compra real",
    label: "Simulador de ingresos",
    accent: "var(--color-chart-5)",
    tilt: "rotate-[3deg] -translate-y-2",
  },
  {
    icon: Share2,
    headline: "Secuencias que avanzan solas, con tu aprobación",
    label: "Automatización",
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
            className={`group w-36 shrink-0 origin-bottom transition-transform duration-300 ease-out hover:z-10 hover:-translate-y-2 hover:rotate-0 hover:scale-110 sm:w-44 ${card.tilt}`}
          >
            <div className="bee-glass flex h-full flex-col rounded-[var(--radius-lg)] p-3.5 shadow-[0_20px_40px_-24px_rgba(34,34,34,0.35)] transition-shadow duration-300 group-hover:shadow-[0_28px_48px_-20px_rgba(34,34,34,0.4)] sm:p-4">
              <div
                className="flex size-8 items-center justify-center rounded-[var(--radius-md)] sm:size-9"
                style={{ background: `color-mix(in srgb, ${card.accent} 18%, white)`, color: card.accent }}
              >
                <card.icon className="size-4 stroke-[1.75]" />
              </div>
              <p className="mt-3 text-xs font-semibold leading-snug tracking-tight text-foreground sm:text-sm">
                {card.headline}
              </p>
              <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: card.accent }}>
                {card.label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
