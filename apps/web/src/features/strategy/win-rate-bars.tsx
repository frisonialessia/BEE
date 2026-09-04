"use client";

import { useLocale, useTranslations } from "next-intl";

import { REST, TONE, level } from "@/components/charts/palette";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Locale } from "@/i18n/locales";
import type { SuccessPattern } from "@/lib/api/feedback";
import { formatChannel, formatPlaybook, getSignalTypeLabels } from "@/lib/format";

const MAX_ROWS = 10;

/**
 * Win rate per argument — one horizontal bar per success pattern
 * (playbook via channel, on a signal type), ranked, in lilac by rank: the
 * best at 100 %, then 70 / 45, the rest in the page grey. The bars spread
 * over the box's height; the rate and the sample only on hover.
 */
export function WinRateBars({ patterns }: { patterns: SuccessPattern[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("signalsStrategies.strategies.works");
  const signalLabels: Record<string, string> = getSignalTypeLabels(locale);
  const ranked = [...patterns].sort((a, b) => b.win_rate - a.win_rate || b.sample_size - a.sample_size);
  const shown = ranked.slice(0, MAX_ROWS);

  if (shown.length === 0) return <p className="bee-caption">{t("barsEmpty")}</p>;

  return (
    <div className="bee-fill flex min-h-0 flex-col justify-evenly gap-2">
      {shown.map((p, i) => {
        const label = t("viaChannel", { playbook: formatPlaybook(p.playbook, locale), channel: formatChannel(p.channel, locale) });
        const signal = signalLabels[p.signal_type] ?? p.signal_type;
        const pct = Math.round(p.win_rate * 100);
        return (
          <Tooltip key={`${p.signal_type}-${p.playbook}-${p.channel}-${p.generator}`}>
            <TooltipTrigger asChild>
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-[38%] min-w-0 shrink-0 sm:w-[32%]">
                  <p className="truncate text-sm font-medium">{label}</p>
                  <p className="bee-micro truncate">{signal}</p>
                </div>
                <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: REST }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: level(TONE.prepared, i) }} />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{label}</p>
              <p>{t("barsTooltip", { pct, won: Math.round(p.win_rate * p.sample_size), total: p.sample_size })}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
      {ranked.length > shown.length && <p className="bee-micro">{t("barsMore", { count: ranked.length - shown.length })}</p>}
    </div>
  );
}
