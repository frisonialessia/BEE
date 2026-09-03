/** Progress toward a goal or completeness. Thin ring, value inside. */
export function ProgressRing({
  value,
  size = 44,
  stroke = 5,
  color = "var(--color-chart-4)",
  track = "color-mix(in srgb, var(--color-text) 8%, var(--color-card))",
  label,
}: {
  /** 0–1 (values above 1 fill the ring and are shown as >100 %). */
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: string;
}) {
  const r = (size - stroke - 1) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} role="img" aria-label={label ?? `${Math.round(value * 100)}%`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" fontSize={size >= 44 ? 11 : 9} fontWeight={700} fill="var(--color-text)">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}
