"use client";

import { useLocale } from "next-intl";

import { TONE, tint } from "@/components/charts/palette";
import type { Locale } from "@/i18n/locales";
import { formatRelativeTime } from "@/lib/i18n/format";
import { formatSignalSource, getSignalTypeLabels } from "@/lib/format";
import type { Signal } from "@/lib/types";

/**
 * One detected market signal as a row of the feed: the type as a small
 * honey chip, the title, when and where it came from, and its score in
 * ink. White rows with a hairline between them — the color lives in the
 * chip alone, never as a fill behind the text.
 */
export function SignalCard({ signal }: { signal: Signal }) {
  const locale = useLocale() as Locale;
  const signalTypeLabels = getSignalTypeLabels(locale);
  const meta = `${formatRelativeTime(signal.detected_at, locale)} · ${formatSignalSource(signal.source, locale)}`;

  return (
    <li className="bee-row">
      <span className="hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex" style={{ background: tint(TONE.market, 45) }}>
        {signalTypeLabels[signal.signal_type] ?? signal.signal_type}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={signal.title}>
          {signal.title}
        </p>
        <p className="mt-0.5 flex items-center gap-2 sm:hidden">
          <span className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: tint(TONE.market, 45) }}>
            {signalTypeLabels[signal.signal_type] ?? signal.signal_type}
          </span>
          <span className="bee-micro truncate">{meta}</span>
        </p>
      </div>
      <span className="bee-micro hidden shrink-0 whitespace-nowrap sm:inline">{meta}</span>
      <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">{Math.round(signal.score)}</span>
    </li>
  );
}
