"use client";

import { useTranslations } from "next-intl";

import { REST, TONE, level } from "@/components/charts/palette";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface MixSlice {
  key: string;
  label: string;
  value: number;
}

/**
 * One segmented bar in a single hue — the three biggest slices at 100 / 70
 * / 45 %, everything else folded into "otras" in the page grey — with the
 * slices listed under it as rows. Shares only on hover, counts in the rows.
 */
export function SegmentedMix({
  slices,
  title,
  otherLabel,
  keepOrder = false,
}: {
  slices: MixSlice[];
  title?: string;
  otherLabel: string;
  /** Keep the caller's order (an ordinal scale, hot → cool) instead of sorting by size. */
  keepOrder?: boolean;
}) {
  const t = useTranslations("signalsStrategies.signals.mix");
  const nonEmpty = slices.filter((s) => s.value > 0);
  const sorted = keepOrder ? nonEmpty : [...nonEmpty].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, x) => s + x.value, 0);
  const top = sorted.slice(0, 3);
  const rest = sorted.slice(3).reduce((s, x) => s + x.value, 0);
  const parts = rest > 0 ? [...top, { key: "__other", label: otherLabel, value: rest }] : top;

  if (total === 0) return <p className="bee-caption">{t("empty")}</p>;

  return (
    <div className="min-w-0">
      {title && <p className="bee-caption mb-2">{title}</p>}
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: REST }} role="img" aria-label={t("aria", { total })}>
        {parts.map((p, i) => (
          <Tooltip key={p.key}>
            <TooltipTrigger asChild>
              <span className="h-full min-w-[3px]" style={{ width: `${(p.value / total) * 100}%`, background: level(TONE.market, i) }} />
            </TooltipTrigger>
            <TooltipContent>{t("tooltip", { label: p.label, count: p.value, pct: Math.round((p.value / total) * 100) })}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <ul className="mt-1">
        {parts.map((p, i) => (
          <li key={p.key} className="bee-row py-1.5!">
            <span className="size-2 shrink-0 rounded-full" style={{ background: level(TONE.market, i), boxShadow: i >= 3 ? "inset 0 0 0 1px var(--color-divider)" : undefined }} />
            <span className="min-w-0 flex-1 truncate text-sm">{p.label}</span>
            <span className="text-sm font-semibold tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
