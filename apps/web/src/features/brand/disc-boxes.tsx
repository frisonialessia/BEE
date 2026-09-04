"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Donut } from "@/components/charts/donut";
import { SERIES, mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Chip, Meter } from "@/features/brand/brand-primitives";
import { STYLE_PREFERENCES, classifyFromTitle } from "@/lib/demo/disc";
import type { Company, Lead } from "@/types/domain";

export type DiscLetter = "D" | "I" | "S" | "C";
export const DISC_ORDER: DiscLetter[] = ["D", "I", "S", "C"];

/** Fixed style → series color, so "D" is the same indigo in the donut, in
 *  the adaptation card and in the stat strip. Categorical, never cycled. */
export const DISC_COLOR: Record<DiscLetter, string> = { D: SERIES[0], I: SERIES[1], S: SERIES[2], C: SERIES[3] };

const LENGTH_FRACTION: Record<string, number> = { short: 1 / 3, medium: 2 / 3, long: 1 };

export interface DiscMix {
  counts: Record<DiscLetter, number>;
  total: number;
  /** Most frequent style, or null when no lead could be classified. */
  top: DiscLetter | null;
}

/**
 * How the seller's audience splits across the four DISC styles — the same
 * title→DISC heuristic the backend's PsychographicAnalyzer runs on every
 * lead (lib/demo/disc.ts is its JS port), applied here over the lead list
 * so the page can show the mix without one API call per lead. Leads whose
 * title matched no rule are left out rather than counted as "D" by default.
 */
export function computeDiscMix(leads: Lead[], companies: Company[]): DiscMix {
  const industryByCompany = new Map(companies.map((c) => [c.id, c.industry]));
  const counts: Record<DiscLetter, number> = { D: 0, I: 0, S: 0, C: 0 };
  for (const lead of leads) {
    if (!lead.title) continue;
    const industry = lead.company_id ? industryByCompany.get(lead.company_id) ?? null : null;
    const result = classifyFromTitle(lead.title, industry);
    if (result.matchedRules === 0) continue;
    counts[result.dominant] += 1;
  }
  const total = DISC_ORDER.reduce((sum, s) => sum + counts[s], 0);
  const top = total > 0 ? DISC_ORDER.reduce((best, s) => (counts[s] > counts[best] ? s : best)) : null;
  return { counts, total, top };
}

/** Row 2, left — the audience mix as a donut. Categorical series colors,
 *  nothing else in this box is colored. */
export function AudienceMixBox({ mix: dm }: { mix: DiscMix }) {
  const t = useTranslations("probarNetworkBrandControl.brand.page.audience");
  const tDisc = useTranslations("probarNetworkBrandControl.brand.page.disc");

  return (
    <OverviewCard span={4} title={t("title")} caption={t("caption")}>
      {dm.total === 0 ? (
        <p className="bee-caption py-6 text-center">{t("empty")}</p>
      ) : (
        <Donut
          slices={DISC_ORDER.map((s) => ({ label: `${s} · ${tDisc(`styles.${s}.name`)}`, value: dm.counts[s], color: DISC_COLOR[s] }))}
          centerLabel={String(dm.total)}
        />
      )}
      <p className="bee-micro mt-2">{t("footnote")}</p>
    </OverviewCard>
  );
}

/** Row 2, right — pick a style, see what BEE changes: tone, length, what it
 *  strips, and a typical opener. The box wears the chosen style's color. */
export function DiscAdaptationBox({ mix: dm }: { mix: DiscMix }) {
  const t = useTranslations("probarNetworkBrandControl.brand.page.disc");
  const [chosen, setChosen] = useState<DiscLetter | null>(null);
  const style: DiscLetter = chosen ?? dm.top ?? "D";
  const hue = DISC_COLOR[style];
  const prefs = STYLE_PREFERENCES[style];
  const lengthFraction = LENGTH_FRACTION[prefs.length] ?? 2 / 3;
  const pct = dm.total > 0 ? Math.round((dm.counts[style] / dm.total) * 100) : null;

  return (
    <OverviewCard
      span={8}
      title={t("title")}
      caption={t("caption")}
      action={
        <div className="bee-filter-tabs" role="tablist" aria-label={t("title")}>
          {DISC_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === style}
              onClick={() => setChosen(s)}
              className={`bee-filter-tab ${s === style ? "bee-filter-tab--active" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>
      }
    >
      <div className="bee-fill flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-sm font-bold" style={{ background: mix(hue, 28) }}>
            {style}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t(`styles.${style}.name`)}</p>
            <p className="bee-caption truncate">{t(`styles.${style}.who`)}</p>
          </div>
          {pct !== null && <Chip tone={hue}>{t("shareOfLeads", { count: dm.counts[style], pct })}</Chip>}
        </div>

        <p className="bee-caption truncate" title={t(`styles.${style}.how`)}>{t(`styles.${style}.how`)}</p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-[var(--radius-md)] px-3 py-2" style={{ background: mix(hue, 16) }}>
            <p className="bee-micro font-medium uppercase tracking-wide">{t("toneLabel")}</p>
            <p className="text-sm font-bold">{t(`styles.${style}.tone`)}</p>
            <p className="bee-micro">{t("toneHint")}</p>
          </div>
          <div className="rounded-[var(--radius-md)] px-3 py-2" style={{ background: mix(hue, 16) }}>
            <p className="bee-micro font-medium uppercase tracking-wide">{t("lengthLabel")}</p>
            <div className="flex items-center gap-2">
              <Meter value={lengthFraction} tone={hue} className="flex-1" />
              <span className="text-sm font-bold">{t(`length.${prefs.length}`)}</span>
            </div>
            <p className="bee-micro">{t("lengthHint")}</p>
          </div>
          <div className="rounded-[var(--radius-md)] px-3 py-2" style={{ background: mix(hue, 16) }}>
            <p className="bee-micro font-medium uppercase tracking-wide">{t("avoidLabel")}</p>
            <p className="text-xs font-medium leading-snug">{t(`styles.${style}.avoid`)}</p>
            <p className="bee-micro">{t("avoidHint")}</p>
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] px-3 py-2" style={{ background: mix(hue, 8), borderLeft: `3px solid ${hue}` }}>
          <p className="bee-micro font-medium uppercase tracking-wide">{t("exampleLabel")}</p>
          <p className="mt-0.5 text-sm italic">“{t(`styles.${style}.example`)}”</p>
        </div>
      </div>
    </OverviewCard>
  );
}
