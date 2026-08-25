import { Building2, Flame, Radio, TrendingUp, UserPlus } from "lucide-react";

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
 */

const TICKER_ITEMS = [
  { icon: TrendingUp, text: "Northwind Robotics levantó una Serie C de USD 40M" },
  { icon: UserPlus, text: "Vantage Health está contratando 20 Account Executives" },
  { icon: Building2, text: "Solace Data nombró un nuevo CRO" },
  { icon: Flame, text: "Anchor Freight alcanzó temperatura de cierre alta" },
  { icon: Radio, text: "Bright Path Analytics visitó la página de pricing" },
  { icon: TrendingUp, text: "Fielder Logistics cerró una ronda Serie B" },
  { icon: UserPlus, text: "Cursive Systems publicó 8 vacantes de RevOps" },
  { icon: Building2, text: "Loom & Co abrió una nueva oficina regional" },
] as const;

function TickerContent() {
  return (
    <>
      {TICKER_ITEMS.map((item, i) => (
        <div
          key={i}
          className="flex shrink-0 items-center gap-2 border-r border-[var(--color-divider)] px-6 py-3"
        >
          <item.icon className="size-3.5 shrink-0 text-[var(--color-chart-4)]" strokeWidth={1.75} />
          <span className="whitespace-nowrap text-xs text-muted-foreground">{item.text}</span>
        </div>
      ))}
    </>
  );
}

export function MarketingSignalTicker() {
  return (
    <div
      className="overflow-hidden border-y border-[var(--color-divider)] bg-[var(--color-primary)]/15"
      role="img"
      aria-label="Ejemplos de señales de mercado detectadas en tiempo real — vista ilustrativa"
    >
      <div className="bee-ticker-track">
        <TickerContent />
        <TickerContent />
      </div>
    </div>
  );
}
