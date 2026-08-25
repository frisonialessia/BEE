"use client";

import { useState } from "react";

/**
 * MarketingHoneycomb — colmena hexagonal interactiva para la landing pública.
 *
 * La real (SignalHexMap, apps/web/src/features/control/components/
 * SignalHexMap.tsx) dibuja sobre <canvas> a partir de leads reales, con un
 * HiveTooltip al pasar el mouse por una celda — no hay sesión ni datos en
 * la landing, así que no hay nada real que dibujar ahí. Esto genera una
 * colmena de la MISMA forma (hexágonos flat-top en filas alternadas, calor
 * irradiando del centro) con valores fijos y deterministas: nada de
 * Math.random() en el cuerpo del componente, porque un valor distinto en
 * cada render de servidor vs. cliente produciría un mismatch de
 * hidratación. El "jitter" que rompe la simetría perfecta, y qué celda
 * lleva qué lead de ejemplo, salen de una función hash simple sobre las
 * coordenadas del hexágono, no de aleatoriedad real — y el propio hover
 * (qué celda está activa, dónde está el mouse) sí es estado de cliente
 * normal, no algo que participe en el render de servidor.
 *
 * El hover replica HiveTooltip: temperatura siempre visible, y — solo en
 * las celdas "pobladas" (calor por encima del umbral, igual que un hexbin
 * real solo agrupa celdas con leads adentro) — empresa, dominio, etapa y
 * palabras clave de ejemplo, igual que la colmena real.
 */

const RADIUS = 4;
const HEX_SIZE = 15;
const POPULATED_THRESHOLD = 0.42;
const HOT_THRESHOLD = 0.8;

interface HexCell {
  q: number;
  r: number;
  x: number;
  y: number;
  heat: number; // 0 (frío) .. 1 (caliente)
  populated: boolean;
  leadIndex: number;
}

// Coseno/seno de 0°/60°/.../300° como constantes exactas en vez de
// Math.cos/Math.sin en cada render: dos motores V8 "iguales" (Node en el
// servidor, Chromium en el cliente) pueden devolver el último bit de una
// función trigonométrica ligeramente distinto — suficiente para que la
// comparación de string exacta de React marque un mismatch de
// hidratación en el atributo `points`, aunque el valor sea visualmente
// idéntico. Constantes fijas + redondeo a 2 decimales eliminan esa
// fuente de no-determinismo por completo.
const HEX_ANGLE_COS = [1, 0.5, -0.5, -1, -0.5, 0.5] as const;
const HEX_ANGLE_SIN = [0, 0.8660254037844387, 0.8660254037844387, 0, -0.8660254037844387, -0.8660254037844387] as const;

function hexPolygonPoints(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const x = cx + size * HEX_ANGLE_COS[i];
    const y = cy + size * HEX_ANGLE_SIN[i];
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

/** Hash entero determinista — mismo propósito que Math.random(), pero
 *  reproducible: mismo input, mismo output siempre, en servidor y cliente. */
function hash01(a: number, b: number): number {
  const h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  const mixed = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967295;
}

// Constante en vez de Math.sqrt(3) en cada celda — mismo motivo que las
// constantes de coseno/seno arriba: elimina otra llamada trigonométrica
// del cálculo de posición, que también alimenta el string `points`.
const SQRT_3 = 1.7320508075688772;

// Etiquetas de etapa — mismo diccionario que SignalHexMap/HiveTooltip, para
// que quien ya vio esto acá reconozca el mismo vocabulario en el dashboard.
const STAGE_LABELS: Record<string, string> = {
  awareness: "Conocimiento",
  consideration: "Consideración",
  decision: "Decisión",
  ready_to_buy: "Listo para comprar",
};

// Pool de empresas de ejemplo — mismas que aparecen en el resto del Demo en
// vivo (Señales, Leads), para que la colmena no invente nombres nuevos que
// no encajen con lo que el visitante ya vio en las otras pestañas.
const HEX_LEADS = [
  { company: "Northwind Robotics", domain: "northwindrobotics.com", stage: "ready_to_buy", keywords: ["ronda Serie C", "presupuesto Q3", "demo agendada"] },
  { company: "Vantage Health", domain: "vantagehealth.io", stage: "decision", keywords: ["contratando 20 AEs", "comparando proveedores"] },
  { company: "Solace Data", domain: "solacedata.ai", stage: "decision", keywords: ["nuevo CRO", "señal de stack tecnológico"] },
  { company: "Fielder Logistics", domain: "fielderlogistics.com", stage: "consideration", keywords: ["visitó pricing", "descargó whitepaper"] },
  { company: "Bright Path Analytics", domain: "brightpathanalytics.com", stage: "consideration", keywords: ["equipo de RevOps activo", "trial en curso"] },
  { company: "Cursive Systems", domain: "cursivesystems.com", stage: "awareness", keywords: ["visitó blog", "se registró a webinar"] },
  { company: "Anchor Freight", domain: "anchorfreight.com", stage: "ready_to_buy", keywords: ["ronda Serie B", "contratando VP Sales"] },
  { company: "Loom & Co", domain: "loomandco.com", stage: "awareness", keywords: ["nueva oficina regional", "equipo en crecimiento"] },
] as const;

function buildGrid(): HexCell[] {
  const cells: HexCell[] = [];
  for (let q = -RADIUS; q <= RADIUS; q++) {
    const r1 = Math.max(-RADIUS, -q - RADIUS);
    const r2 = Math.min(RADIUS, -q + RADIUS);
    for (let r = r1; r <= r2; r++) {
      const dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
      const jitter = (hash01(q, r) - 0.5) * 0.35;
      const heat = Math.min(1, Math.max(0, 1 - dist / RADIUS + jitter));
      // Hash distinto (offset de semilla) al del jitter de calor, para que
      // qué lead cae en qué celda no esté correlacionado con su temperatura.
      const leadIndex = Math.floor(hash01(q + 101, r - 37) * HEX_LEADS.length);
      cells.push({
        q,
        r,
        x: HEX_SIZE * 1.5 * q,
        y: HEX_SIZE * SQRT_3 * (r + q / 2),
        heat,
        populated: heat > POPULATED_THRESHOLD,
        leadIndex,
      });
    }
  }
  return cells;
}

const CELLS = buildGrid();
const VIEW = HEX_SIZE * 1.5 * RADIUS + HEX_SIZE * 1.5;

/** Frío → azul/lavanda de marca, medio → violeta/magenta, caliente →
 *  dorado/naranja — mismas tres bandas que la barra "Frío → Caliente"
 *  ya usada en SignalHexMap, solo que interpoladas por hexágono en vez
 *  de por posición en una barra lineal. */
function heatColor(heat: number): string {
  if (heat < 0.5) {
    const t = heat / 0.5;
    return `color-mix(in srgb, var(--color-chart-6) ${Math.round(t * 100)}%, var(--color-chart-4) ${Math.round((1 - t) * 100)}%)`;
  }
  const t = (heat - 0.5) / 0.5;
  return `color-mix(in srgb, var(--color-chart-1) ${Math.round(t * 100)}%, var(--color-chart-6) ${Math.round((1 - t) * 100)}%)`;
}

function HexTooltip({
  cell,
  pointer,
}: {
  cell: HexCell;
  pointer: { x: number; y: number };
}) {
  const lead = cell.populated ? HEX_LEADS[cell.leadIndex] : null;

  return (
    <div
      className="bee-hex-tooltip pointer-events-none absolute z-20 w-44 rounded-lg p-3"
      style={{
        left: Math.min(Math.max(pointer.x + 10, 4), 220 - 176 + 32),
        top: pointer.y > 90 ? pointer.y - 10 : pointer.y + 14,
        transform: pointer.y > 90 ? "translateY(-100%)" : undefined,
      }}
    >
      <p className="bee-eyebrow text-[var(--color-chart-5)]">
        Temperatura · {Math.round(cell.heat * 100)}°
      </p>
      {lead ? (
        <>
          <p className="mt-1 text-xs font-medium leading-snug">{lead.company}</p>
          <p className="bee-micro">{lead.domain}</p>
          <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
            <span className="rounded-md bg-muted px-1.5 py-0.5">
              {STAGE_LABELS[lead.stage]}
            </span>
            {cell.heat > HOT_THRESHOLD && (
              <span className="rounded-md bg-[var(--color-primary)] px-1.5 py-0.5 text-[var(--color-chart-5)]">
                CALIENTE
              </span>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 bee-micro">{lead.keywords.slice(0, 2).join(" · ")}</p>
        </>
      ) : (
        <p className="mt-1 bee-micro">Sin señales de intención activas todavía.</p>
      )}
    </div>
  );
}

export function MarketingHoneycomb() {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  function handlePointer(i: number, e: React.MouseEvent<SVGPolygonElement>) {
    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    setHoveredIdx(i);
    setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  const hovered = hoveredIdx !== null ? CELLS[hoveredIdx] : null;

  return (
    <div className="relative mx-auto h-full w-full max-w-[220px]">
      <svg
        viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
        className="mx-auto block h-full w-full max-w-[220px]"
        role="img"
        aria-label="Mapa de calor hexagonal de intención de compra — vista ilustrativa, pasa el mouse por una celda"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {CELLS.map((cell, i) => (
          <polygon
            key={i}
            points={hexPolygonPoints(cell.x, cell.y, HEX_SIZE - 1.5)}
            fill={heatColor(cell.heat)}
            stroke={hoveredIdx === i ? "var(--color-chart-5)" : "var(--color-background)"}
            strokeWidth={hoveredIdx === i ? 2 : 1.5}
            opacity={Number((0.55 + cell.heat * 0.45).toFixed(3))}
            className="cursor-pointer transition-[stroke,stroke-width] duration-100"
            onMouseEnter={(e) => handlePointer(i, e)}
            onMouseMove={(e) => handlePointer(i, e)}
          />
        ))}
      </svg>
      {hovered && <HexTooltip cell={hovered} pointer={pointer} />}
    </div>
  );
}
