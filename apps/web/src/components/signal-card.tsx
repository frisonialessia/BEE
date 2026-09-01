"use client";

import { Radio } from "lucide-react";
import { useLocale } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/locales";
import { formatRelativeTime } from "@/lib/i18n/format";
import { BENTO_TONES } from "@/lib/brand/colors";
import { scoreVariant, signalTagLabels, signalTypeLabels } from "@/lib/format";
import type { Signal } from "@/lib/types";

/** A single detected market signal in the Bento grid. */
export function SignalCard({
  signal,
  toneIndex = 0,
}: {
  signal: Signal;
  toneIndex?: number;
}) {
  const locale = useLocale() as Locale;
  const tags = signal.analysis?.tags ?? [];
  const primary = signal.analysis?.primary_analyzer;
  const bg = BENTO_TONES[toneIndex % BENTO_TONES.length];

  return (
    <article
      className="bee-bento bee-bento-pad transition-colors hover:border-[var(--color-chart-4)]"
      style={{ background: bg }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-border bg-background"
          style={{ borderRadius: "var(--radius-md)" }}
        >
          <Radio className="size-3.5 stroke-[1.25]" style={{ color: "var(--color-chart-4)" }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{signalTypeLabels[signal.signal_type]}</Badge>
            <span className="bee-micro">
              {formatRelativeTime(signal.detected_at, locale)} · {signal.source}
            </span>
          </div>

          <h3 className="mt-1.5 truncate text-sm font-semibold">{signal.title}</h3>
          {signal.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {signal.description}
            </p>
          )}

          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="border border-border bg-background px-1.5 py-0.5 bee-micro"
                  style={{ borderRadius: "var(--radius-sm)" }}
                >
                  {signalTagLabels[tag] ?? tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={scoreVariant(signal.score)}>{Math.round(signal.score)}</Badge>
          {primary && (
            <span className="bee-micro">{primary}</span>
          )}
        </div>
      </div>
    </article>
  );
}
