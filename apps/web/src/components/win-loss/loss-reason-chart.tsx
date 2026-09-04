"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { REST, TONE, level } from "@/components/charts/palette";
import type { Locale } from "@/i18n/locales";
import { getLossReasonLabels } from "@/lib/format";
import { formatCurrencyUSD } from "@/lib/i18n/format";
import type { LossReasonStat } from "@/lib/win-loss";

/** Barras horizontales rankeadas por frecuencia — la razón más común de
 *  pérdida arriba. Sin librería de gráficas, como el resto de la BI de BEE.
 *  One hue (lilac, what BEE could have prepared better) told apart by rank:
 *  100 / 70 / 45, then the page grey. The count, the share and the money
 *  lost show only on hover, on the same ink tooltip every chart uses. */
export function LossReasonChart({ stats }: { stats: LossReasonStat[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("forecastWinLoss.lossReasonChart");
  const lossReasonLabels = getLossReasonLabels(locale);
  const [hover, setHover] = useState<number | null>(null);

  if (stats.length === 0) {
    return <p className="bee-caption py-6 text-center">{t("empty")}</p>;
  }

  const maxCount = Math.max(1, ...stats.map((s) => s.count));

  return (
    <ul className="bee-fill flex flex-col justify-around gap-2">
      {stats.map((s, i) => {
        const label = s.reason === "unspecified" ? t("unspecified") : lossReasonLabels[s.reason];
        return (
          <li key={s.reason} className="relative flex items-center gap-4">
            <p className="bee-caption w-36 shrink-0 truncate sm:w-44">{label}</p>
            <svg className="h-5 min-w-0 flex-1" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect width="100%" height="100%" rx={4} fill={REST} />
              <rect width={`${Math.max((s.count / maxCount) * 100, 4)}%`} height="100%" rx={4} fill={level(TONE.prepared, i)} opacity={hover !== null && hover !== i ? 0.5 : 1} />
            </svg>
            {hover === i && (
              <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2 py-1 text-xs font-medium text-[var(--color-card)]">
                {t("tooltip", { label, count: s.count, percent: Math.round(s.fraction * 100), value: formatCurrencyUSD(s.value, locale) })}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
