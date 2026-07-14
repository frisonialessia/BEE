"use client";

import { SignalCard } from "@/components/signal-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSignals } from "@/hooks/queries/use-signals";

/** Signals feed — real-time market triggers from the BEE Signal Engine. */
export function SignalsDashboard() {
  const { data: result, isLoading, isError } = useSignals(100);

  const signals = result?.data ?? [];
  const live = result?.live ?? false;
  const hotCount = signals.filter((s) => s.score >= 75).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Signals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Market triggers ingested by the Signal Engine — funding, hiring, tech adoption, and more.
          </p>
        </div>
        <Badge variant={live ? "success" : "warning"}>
          {live ? "Live" : "Demo data"}
        </Badge>
      </div>

      <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
        <span>{signals.length} total</span>
        <span>{hotCount} high-intent (≥75)</span>
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p className="mt-6 text-sm text-destructive">Failed to load signals.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
          {signals.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No signals yet. POST to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/api/v1/signals/webhook</code>{" "}
              to ingest.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
