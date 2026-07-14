import { Radio } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { scoreVariant, signalTypeLabels, timeAgo } from "@/lib/format";
import type { Signal } from "@/lib/types";

/** A single detected market signal, as surfaced by the Signal Engine. */
export function SignalCard({ signal }: { signal: Signal }) {
  const tags = signal.analysis?.tags ?? [];
  const primary = signal.analysis?.primary_analyzer;

  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="flex items-start gap-4 p-5">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Radio className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{signalTypeLabels[signal.signal_type]}</Badge>
            <span className="text-xs text-muted-foreground">
              {timeAgo(signal.detected_at)} · via {signal.source}
            </span>
          </div>

          <h3 className="mt-2 truncate text-sm font-medium">{signal.title}</h3>
          {signal.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {signal.description}
            </p>
          )}

          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={scoreVariant(signal.score)}>{Math.round(signal.score)}</Badge>
          {primary && (
            <span className="text-[11px] text-muted-foreground">{primary}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
