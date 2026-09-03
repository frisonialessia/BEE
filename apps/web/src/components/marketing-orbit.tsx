import { Radio, Share2, Sparkles, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { OrbitScroller } from "@/components/marketing-orbit-scroller";

/**
 * MarketingOrbit — galería de tarjetas en arco (estilo coverflow) para el
 * hero público. Puramente CSS (rotate/translate por tarjeta, hover para
 * enderezar y elevar) — sin JS, sin librería de carrusel — salvo el
 * centrado inicial del scroll en móvil, ver OrbitScroller.
 *
 * Cada tarjeta es una propuesta de valor del módulo — no una cifra de la
 * app en vivo. Antes decían "247 señales esta semana" / "+18% vs.
 * escenario base": números que parecían salidos de una cuenta real y que
 * ningún visitante nuevo puede verificar. Un visitante que entra por
 * primera vez no tiene 247 señales de nada — mostrarle eso rompe la
 * confianza apenas la pisa. Esto describe lo que el módulo HACE, no lo
 * que una cuenta activa acumuló.
 *
 * Server component (async, `getTranslations`) — el único estado de
 * cliente (centrar el scroll inicial) vive en OrbitScroller, no acá.
 */

const CARD_META = [
  { id: "signals", icon: Radio, accent: "var(--color-chart-4)", tilt: "-rotate-[10deg] translate-y-3 sm:translate-y-5" },
  { id: "brief", icon: Sparkles, accent: "var(--color-chart-2)", tilt: "-rotate-[3deg] -translate-y-2" },
  { id: "simulator", icon: TrendingUp, accent: "var(--color-chart-5)", tilt: "rotate-[3deg] -translate-y-2" },
  { id: "automation", icon: Share2, accent: "var(--color-chart-6)", tilt: "rotate-[10deg] translate-y-3 sm:translate-y-5" },
] as const;

export async function MarketingOrbit() {
  const t = await getTranslations("landing.orbit.cards");

  return (
    // Scroll container scoped here (not on the hero section, which still
    // needs its own overflow-hidden to contain the blurred gradient blobs)
    // — below the sm breakpoint the fanned cards are wider than the
    // viewport, so without this they'd get silently clipped by the
    // section's own overflow-hidden instead of staying reachable. See
    // OrbitScroller for why this is a client component (centers the
    // initial scroll position) and its own py-8 rationale (the CSS
    // overflow spec forcing overflow-y: auto once -x is set, which would
    // otherwise clip the tilted cards' overshoot).
    <OrbitScroller>
      <div
        className="mx-auto flex w-fit min-w-full items-end justify-center gap-3 sm:gap-4"
        style={{ perspective: "1400px" }}
        aria-hidden
      >
        {CARD_META.map((card) => (
          <div
            key={card.id}
            className={`group w-36 shrink-0 origin-bottom transition-transform duration-300 ease-out hover:z-10 hover:-translate-y-2 hover:rotate-0 hover:scale-110 sm:w-44 ${card.tilt}`}
          >
            <div className="bee-glass flex h-full flex-col rounded-[var(--radius-lg)] p-3.5 shadow-[0_20px_40px_-24px_color-mix(in_srgb,var(--color-text)_35%,transparent)] transition-shadow duration-300 group-hover:shadow-[0_28px_48px_-20px_color-mix(in_srgb,var(--color-text)_40%,transparent)] sm:p-4">
              <div
                className="flex size-8 items-center justify-center rounded-[var(--radius-md)] sm:size-9"
                style={{ background: `color-mix(in srgb, ${card.accent} 18%, white)`, color: card.accent }}
              >
                <card.icon className="size-4 stroke-[1.75]" />
              </div>
              <p className="mt-3 text-xs font-semibold leading-snug tracking-tight text-foreground sm:text-sm">
                {t(`${card.id}.headline`)}
              </p>
              <p className="mt-2.5 text-micro font-semibold uppercase tracking-wide" style={{ color: card.accent }}>
                {t(`${card.id}.label`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </OrbitScroller>
  );
}
