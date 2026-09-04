import { DATA } from "@/components/charts/palette";

export interface FunnelRow {
  label: string;
  value: number;
  color?: string;
}

/** How many items sit in each stage: label, thin bar, number at the end. */
export function HorizontalFunnel({ rows, formatValue = (v) => String(v) }: { rows: FunnelRow[]; formatValue?: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="bee-fill flex flex-col justify-evenly gap-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-xs">
          <span className="truncate">{r.label}</span>
          <div className="h-4 w-full">
            <div className="h-4 rounded-[4px]" style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 3 : 0)}%`, background: r.color ?? DATA.indigo }} />
          </div>
          <span className="w-10 text-right font-semibold tabular-nums">{formatValue(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
