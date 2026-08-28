import { Tooltip as TooltipPrimitive } from "radix-ui";

import { TooltipContent } from "@/components/ui/tooltip";

/**
 * Sparkline — trend indicator inline dentro de una tarjeta KPI.
 *
 * Sin ejes ni grilla (son ruido a este tamaño); una sola serie, así que no
 * lleva leyenda. Línea de 2px con extremos redondeados, color heredado del
 * texto que lo rodea vía `currentColor` para que combine con el tono de la
 * tarjeta (bee-bento--primary/--warm/--muted) sin necesitar una prop de color.
 * Cada punto tiene un tooltip real al pasar el mouse — el círculo visible es
 * chico a propósito (no compite con el número grande de la tarjeta), así que
 * el área donde responde el hover es más grande que el círculo pintado.
 */
export function Sparkline({
  values,
  width = 88,
  height = 28,
  className,
  formatValue = (v) => String(Math.round(v * 10) / 10),
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  /** Cómo mostrar el valor de cada punto en su tooltip. Por defecto,
   * redondeado a 1 decimal (suficiente para un promedio; un conteo entero
   * ya sale limpio). */
  formatValue?: (value: number) => string;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 3; // deja lugar al grosor del trazo y al punto final

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];

  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={className}
        role="img"
        aria-label={`Tendencia: ${values.join(", ")}`}
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
        {points.map(([x, y], i) => (
          <TooltipPrimitive.Root key={i}>
            <TooltipPrimitive.Trigger asChild>
              {/* Círculo invisible más grande que el visible: el objetivo
               * del hover no debe depender de acertarle a 2.5px exactos. */}
              <circle cx={x} cy={y} r={7} fill="transparent" className="cursor-default" />
            </TooltipPrimitive.Trigger>
            <TooltipContent>{formatValue(values[i])}</TooltipContent>
          </TooltipPrimitive.Root>
        ))}
        <circle cx={lastX} cy={lastY} r={2.5} fill="currentColor" />
      </svg>
    </TooltipPrimitive.Provider>
  );
}
