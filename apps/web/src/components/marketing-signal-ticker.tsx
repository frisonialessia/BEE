import { Building2, Flame, Radio, TrendingUp, UserPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * MarketingSignalTicker — cinta horizontal de ejemplos de señales en loop
 * continuo, debajo del hero. Puro CSS (mismo criterio que MarketingOrbit:
 * sin librería de carrusel, sin JS de animación) — @keyframes
 * bee-ticker-scroll en globals.css desplaza la pista -50% de su ancho; el
 * contenido está duplicado una vez adentro, así el loop no muestra un
 * salto en el punto de reinicio. Pausa al pasar el mouse (accesibilidad:
 * un visitante que quiera leer un item no tiene que perseguirlo).
 *
 * Contenido de ejemplo, no señales reales de una cuenta — mismo criterio
 * de honestidad que el resto de la landing (ver MarketingOrbit). El punto
 * acá no es el dato puntual, es transmitir "esto pasa todo el tiempo, en
 * tiempo real" antes de que el visitante llegue al Demo en vivo.
 *
 * Server component (async, `getTranslations`) — el scroll es puro CSS, así
 * que no necesita `"use client"` ni `useTranslations` pese a "animar".
 */

const TICKER_ICONS = [TrendingUp, UserPlus, Building2, Flame, Radio, TrendingUp, UserPlus, Building2] as const;

function TickerContent({ items }: { items: readonly string[] }) {
  return (
    <>
      {items.map((text, i) => {
        const Icon = TICKER_ICONS[i];
        return (
          <div
            key={i}
            className="flex shrink-0 items-center gap-2 border-r border-[var(--color-divider)] px-6 py-3"
          >
            <Icon className="size-3.5 shrink-0 text-[var(--color-chart-4)]" strokeWidth={1.75} />
            <span className="whitespace-nowrap text-xs text-muted-foreground">{text}</span>
          </div>
        );
      })}
    </>
  );
}

export async function MarketingSignalTicker() {
  const t = await getTranslations("landing.ticker");
  const items = t.raw("items") as string[];

  return (
    <div
      className="overflow-hidden border-y border-[var(--color-divider)] bg-[var(--color-primary)]/15"
      role="img"
      aria-label={t("ariaLabel")}
    >
      <div className="bee-ticker-track">
        <TickerContent items={items} />
        <TickerContent items={items} />
      </div>
    </div>
  );
}
