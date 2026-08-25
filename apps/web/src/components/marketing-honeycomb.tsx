/**
 * MarketingHoneycomb — colmena hexagonal estática para la landing pública.
 *
 * La real (SignalHexMap, apps/web/src/features/control/components/
 * SignalHexMap.tsx) dibuja sobre <canvas> a partir de leads reales — no
 * hay sesión ni datos en la landing, así que no hay nada real que
 * dibujar ahí. Esto genera una colmena de la MISMA forma (hexágonos
 * flat-top en filas alternadas, calor irradiando del centro) con valores
 * fijos y deterministas: nada de Math.random() en el cuerpo del
 * componente, porque un valor distinto en cada render de servidor vs.
 * cliente produciría un mismatch de hidratación. El "jitter" que rompe
 * la simetría perfecta sale de una función hash simple sobre las
 * coordenadas del hexágono, no de aleatoriedad real.
 */

const RADIUS = 4;
const HEX_SIZE = 15;

interface HexCell {
  x: number;
  y: number;
  heat: number; // 0 (frío) .. 1 (caliente)
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
function hash01(q: number, r: number): number {
  const h = Math.imul(q, 374761393) + Math.imul(r, 668265263);
  const mixed = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967295;
}

// Constante en vez de Math.sqrt(3) en cada celda — mismo motivo que las
// constantes de coseno/seno arriba: elimina otra llamada trigonométrica
// del cálculo de posición, que también alimenta el string `points`.
const SQRT_3 = 1.7320508075688772;

function buildGrid(): HexCell[] {
  const cells: HexCell[] = [];
  for (let q = -RADIUS; q <= RADIUS; q++) {
    const r1 = Math.max(-RADIUS, -q - RADIUS);
    const r2 = Math.min(RADIUS, -q + RADIUS);
    for (let r = r1; r <= r2; r++) {
      const dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
      const jitter = (hash01(q, r) - 0.5) * 0.35;
      const heat = Math.min(1, Math.max(0, 1 - dist / RADIUS + jitter));
      cells.push({
        x: HEX_SIZE * 1.5 * q,
        y: HEX_SIZE * SQRT_3 * (r + q / 2),
        heat,
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

export function MarketingHoneycomb() {
  return (
    <svg
      viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
      className="mx-auto block h-full w-full max-w-[220px]"
      role="img"
      aria-label="Mapa de calor hexagonal de intención de compra — vista ilustrativa"
    >
      {CELLS.map((cell, i) => (
        <polygon
          key={i}
          points={hexPolygonPoints(cell.x, cell.y, HEX_SIZE - 1.5)}
          fill={heatColor(cell.heat)}
          stroke="var(--color-background)"
          strokeWidth={1.5}
          opacity={Number((0.55 + cell.heat * 0.45).toFixed(3))}
        />
      ))}
    </svg>
  );
}
