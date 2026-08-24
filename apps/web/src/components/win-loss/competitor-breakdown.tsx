import type { CompetitorStat } from "@/lib/win-loss";

/** Por competidor: cuántas veces le ganamos y cuántas nos ganó — la lista de
 *  "contra quién competimos de verdad", no solo el nombre suelto que hoy vive
 *  enterrado en `notes` de texto libre. */
export function CompetitorBreakdown({ stats }: { stats: CompetitorStat[] }) {
  if (stats.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Todavía no se registró ningún competidor en un cierre.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {stats.map((s) => {
        const total = s.wins + s.losses;
        const winPct = total > 0 ? (s.wins / total) * 100 : 0;
        return (
          <div key={s.competitor}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium">{s.competitor}</p>
              <p className="shrink-0 text-[11px] text-muted-foreground">
                {s.wins} ganadas · {s.losses} perdidas
              </p>
            </div>
            <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-[var(--color-primary)]/20">
              <div className="h-full bg-[var(--success)]" style={{ width: `${winPct}%` }} />
              <div className="h-full bg-[var(--color-chart-2)]/70" style={{ width: `${100 - winPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
