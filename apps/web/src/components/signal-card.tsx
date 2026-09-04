"use client";

import { Radio } from "lucide-react";
import { useLocale } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/locales";
import { formatRelativeTime } from "@/lib/i18n/format";
import { signalFill, signalTone, TONE_CSS_VAR } from "@/lib/brand/colors";
import { formatSignalSource, getSignalTagLabels, getSignalTypeLabels, scoreVariant } from "@/lib/format";
import type { Signal } from "@/lib/types";

/** A single detected market signal in the Bento grid. */
/** Colored by signal *type* (see SIGNAL_TYPE_TONE) — the same kind of
 *  signal always gets the same fill, instead of a rotation by list position
 *  that made two funding rounds look different and a funding round and a
 *  hire look the same. */
export function SignalCard({ signal }: { signal: Signal }) {
  const locale = useLocale() as Locale;
  const signalTypeLabels = getSignalTypeLabels(locale);
  const signalTagLabels = getSignalTagLabels(locale);
  const tags = signal.analysis?.tags ?? [];
  const bg = signalFill(signal.signal_type);
  const accent = TONE_CSS_VAR[signalTone(signal.signal_type)];

  return (
    <article
      className="bee-bento bee-bento-pad transition-colors hover:border-[var(--color-chart-4)]"
      style={{ background: bg }}
    >
      <div className="flex items-start gap-4">
        <div
          className="mt-1 flex size-8 shrink-0 items-center justify-center border border-border bg-background"
          style={{ borderRadius: "var(--radius-md)" }}
        >
          <Radio className="size-3.5 stroke-[1.25]" style={{ color: accent }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{signalTypeLabels[signal.signal_type]}</Badge>
            <span className="bee-micro">
              {formatRelativeTime(signal.detected_at, locale)} · {formatSignalSource(signal.source, locale)}
            </span>
          </div>

          <h3 className="mt-2 truncate text-sm font-semibold">{signal.title}</h3>
          {signal.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {signal.description}
            </p>
          )}

          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="border border-border bg-background px-2 py-1 bee-micro"
                  style={{ borderRadius: "var(--radius-sm)" }}
                >
                  {signalTagLabels[tag] ?? tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Score only — the analyzer id that used to sit under it repeated
            the type badge in raw snake_case. */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={scoreVariant(signal.score)}>{Math.round(signal.score)}</Badge>
        </div>
      </div>
    </article>
  );
}
