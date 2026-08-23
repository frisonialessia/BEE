const AXES = [
  { key: "d", label: "Dominancia" },
  { key: "i", label: "Influencia" },
  { key: "s", label: "Estabilidad" },
  { key: "c", label: "Análisis" },
] as const;

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 78;
const RINGS = [0.25, 0.5, 0.75, 1];

function axisPoint(index: number, fraction: number) {
  // Empieza arriba (D) y va en sentido horario — D, I, S, C.
  const angle = -Math.PI / 2 + index * (Math.PI / 2);
  return {
    x: CENTER + Math.cos(angle) * RADIUS * fraction,
    y: CENTER + Math.sin(angle) * RADIUS * fraction,
  };
}

/**
 * DiscRadar — perfil de comunicación DISC de un lead, en sus 4 dimensiones
 * reales (D/I/S/C). Una sola serie: sin leyenda, la etiqueta de cada eje
 * identifica el valor. Área semitransparente + trazo de 2px, grilla y ejes
 * recesivos.
 */
export function DiscRadar({
  d,
  i,
  s,
  c,
  className,
}: {
  d: number;
  i: number;
  s: number;
  c: number;
  className?: string;
}) {
  const values = [d, i, s, c];
  const points = values.map((v, idx) => axisPoint(idx, Math.max(0, Math.min(1, v))));
  const areaPath = `M${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L")} Z`;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={className} role="img" aria-label="Perfil DISC del lead">
      {/* Anillos de referencia */}
      {RINGS.map((r) => {
        const ringPoints = AXES.map((_, idx) => axisPoint(idx, r));
        const path = `M${ringPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L")} Z`;
        return <path key={r} d={path} fill="none" stroke="var(--color-divider)" strokeWidth={1} />;
      })}

      {/* Ejes */}
      {AXES.map((axis, idx) => {
        const outer = axisPoint(idx, 1);
        return (
          <line
            key={axis.key}
            x1={CENTER}
            y1={CENTER}
            x2={outer.x}
            y2={outer.y}
            stroke="var(--color-divider)"
            strokeWidth={1}
          />
        );
      })}

      {/* Área del perfil */}
      <path d={areaPath} fill="var(--color-chart-4)" fillOpacity={0.22} stroke="var(--color-chart-4)" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, idx) => (
        <circle key={idx} cx={p.x} cy={p.y} r={3} fill="var(--color-chart-4)" />
      ))}

      {/* Etiquetas de eje + valor */}
      {AXES.map((axis, idx) => {
        const labelPos = axisPoint(idx, 1.32);
        const anchor = idx === 1 ? "start" : idx === 3 ? "end" : "middle";
        return (
          <text
            key={axis.key}
            x={labelPos.x}
            y={labelPos.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="fill-muted-foreground"
            style={{ fontSize: 11, fontWeight: 500 }}
          >
            {axis.label} · {Math.round(values[idx] * 100)}%
          </text>
        );
      })}
    </svg>
  );
}
