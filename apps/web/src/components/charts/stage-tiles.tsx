import { mix } from "@/components/charts/palette";

export interface StageTile {
  label: string;
  value: string;
  color: string;
}

/** Filled tiles, one per stage — the only filled row in a box. */
export function StageTiles({ tiles }: { tiles: StageTile[] }) {
  const cols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[Math.min(4, Math.max(2, tiles.length)) as 2 | 3 | 4];
  return (
    <div className={`grid ${cols} gap-2`}>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-[var(--radius-md)] px-3 py-2" style={{ background: mix(t.color, 28) }}>
          <p className="bee-micro font-medium text-[var(--color-text)]">{t.label}</p>
          <p className="text-sm font-bold tabular-nums">{t.value}</p>
        </div>
      ))}
    </div>
  );
}
