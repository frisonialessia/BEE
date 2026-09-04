"use client";

import { useMemo, useState } from "react";

import { TONE, tint } from "@/components/charts/palette";
import { useBoxSize } from "@/components/charts/use-box-size";
import type { NetworkConnection } from "@/lib/types";

/**
 * The relationship map: you at the centre, every contact a round lavender
 * disc, joined to you by a thin ink line. Distance is closeness — a 10/10
 * relationship sits near the centre, a 2/10 at the edge — and disc size
 * grows with strength, so the shape of the network reads before any name.
 * Contacts of the same company sit next to each other. The selected disc
 * wears indigo, the only second color in the box. Fills its card
 * (use-box-size); names show when there is room, the rest lives in the
 * hover tooltip.
 */
export function RelationshipMap({
  connections,
  selectedId,
  onSelect,
  youLabel,
  minHeight = 260,
}: {
  connections: NetworkConnection[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  youLabel: string;
  minHeight?: number;
}) {
  const [ref, { width: W, height: H }] = useBoxSize<HTMLDivElement>({ width: 600, height: minHeight });
  const [hover, setHover] = useState<string | null>(null);

  const nodes = useMemo(() => {
    const cx = W / 2;
    const cy = H / 2;
    // An ellipse that uses the whole box: room for a name on each side,
    // a little on top and bottom.
    const rx = Math.max(60, W / 2 - (W >= 560 ? 120 : 24));
    const ry = Math.max(50, H / 2 - 22);
    // Same company → adjacent angles; within a company, strongest first.
    const sorted = [...connections].sort((a, b) => a.contact_company.localeCompare(b.contact_company) || b.relationship_strength - a.relationship_strength);
    const n = Math.max(1, sorted.length);
    return sorted.map((c, i) => {
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const strength = Math.max(1, Math.min(10, c.relationship_strength));
      // 10/10 sits at 40 % of the way out, 1/10 at the edge.
      const f = 0.4 + ((10 - strength) / 9) * 0.6;
      return { c, x: cx + Math.cos(angle) * rx * f, y: cy + Math.sin(angle) * ry * f, radius: 5 + strength * 0.7, angle };
    });
  }, [connections, W, H]);

  const showNames = W >= 560 && connections.length <= 24;
  const active = nodes.find((n) => n.c.id === (hover ?? selectedId)) ?? null;

  return (
    <div ref={ref} className="bee-fill relative w-full" style={{ minHeight }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block" onClick={() => onSelect(null)}>
        {nodes.map((n) => (
          <line key={`e-${n.c.id}`} x1={W / 2} y1={H / 2} x2={n.x} y2={n.y} stroke="color-mix(in srgb, var(--color-text) 12%, transparent)" strokeWidth={1} />
        ))}
        <circle cx={W / 2} cy={H / 2} r={16} fill={TONE.calm} />
        <text x={W / 2} y={H / 2 + 4} textAnchor="middle" fill="var(--color-text)" style={{ fontSize: "var(--bee-fs-body-2)", fontWeight: 600 }}>
          {youLabel}
        </text>
        {nodes.map((n) => {
          const selected = n.c.id === selectedId;
          const hovered = n.c.id === hover;
          const outward = Math.cos(n.angle) >= 0;
          return (
            <g
              key={n.c.id}
              className="cursor-pointer"
              onMouseEnter={() => setHover(n.c.id)}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(selected ? null : n.c.id);
              }}
            >
              <circle cx={n.x} cy={n.y} r={n.radius + (selected ? 3 : 0)} fill={selected ? TONE.forecast : hovered ? tint(TONE.calm, 100) : tint(TONE.calm, 70)} stroke="var(--color-card)" strokeWidth={2} />
              {showNames && (
                <text
                  x={n.x + (outward ? n.radius + 6 : -(n.radius + 6))}
                  y={n.y + 4}
                  textAnchor={outward ? "start" : "end"}
                  fill={selected ? "var(--color-text)" : "var(--color-text-muted)"}
                  style={{ fontSize: "var(--bee-fs-body-2)", fontWeight: selected ? 600 : 400 }}
                >
                  {n.c.contact_name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {active && (
        <div
          className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2.5 py-1.5 text-xs text-[var(--color-card)] ${
            active.x / W > 0.7 ? "-translate-x-full" : active.x / W < 0.3 ? "" : "-translate-x-1/2"
          }`}
          style={{ left: active.x, top: Math.max(0, active.y - active.radius - 44) }}
        >
          <p className="font-semibold">{active.c.contact_name}</p>
          <p className="opacity-80">
            {active.c.contact_company} · {active.c.relationship_strength}/10
          </p>
        </div>
      )}
    </div>
  );
}
