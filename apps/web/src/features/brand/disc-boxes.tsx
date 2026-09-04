"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { REST, TONE, level, tint } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { DiscRadar } from "@/components/disc-radar";
import { EmptyLine, Meter, StateChip } from "@/features/control/components/primitives";
import { Pill } from "@/features/crm/drawer/primitives";
import { STYLE_PREFERENCES, classifyFromTitle } from "@/lib/demo/disc";
import type { Company, Lead } from "@/types/domain";

export type DiscLetter = "D" | "I" | "S" | "C";
export const DISC_ORDER: DiscLetter[] = ["D", "I", "S", "C"];

/** The whole page wears magenta: it is about how BEE adapts to a person. */
const HUE = TONE.urgency;

const LENGTH_FRACTION: Record<string, number> = { short: 1 / 3, medium: 2 / 3, long: 1 };

export interface DiscMix {
  counts: Record<DiscLetter, number>;
  total: number;
  /** Most frequent style, or null when no lead could be classified. */
  top: DiscLetter | null;
  /** Average intensity of each dimension across the classified leads. */
  means: { d: number; i: number; s: number; c: number };
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
  const sums = { d: 0, i: 0, s: 0, c: 0 };
  for (const lead of leads) {
    if (!lead.title) continue;
    const industry = lead.company_id ? industryByCompany.get(lead.company_id) ?? null : null;
    const result = classifyFromTitle(lead.title, industry);
    if (result.matchedRules === 0) continue;
    counts[result.dominant] += 1;
    sums.d += result.d;
    sums.i += result.i;
    sums.s += result.s;
    sums.c += result.c;
  }
  const total = DISC_ORDER.reduce((sum, s) => sum + counts[s], 0);
  const top = total > 0 ? DISC_ORDER.reduce((best, s) => (counts[s] > counts[best] ? s : best)) : null;
  const means = total > 0 ? { d: sums.d / total, i: sums.i / total, s: sums.s / total, c: sums.c / total } : { d: 0, i: 0, s: 0, c: 0 };
  return { counts, total, top, means };
}

/** Row 1, left — the audience's DISC shape: one polygon, the average of
 *  the four dimensions over every classified lead. */
export function AudienceRadarBox({ mix: dm }: { mix: DiscMix }) {
  const t = useTranslations("probarNetworkBrandControl.brand.page.radar");
  return (
    <OverviewCard span={5} title={t("title")} caption={t("caption")}>
      {dm.total === 0 ? (
        <EmptyLine>{t("empty")}</EmptyLine>
      ) : (
        <div className="bee-fill flex min-h-[220px] items-center justify-center">
          <DiscRadar d={dm.means.d} i={dm.means.i} s={dm.means.s} c={dm.means.c} tone={HUE} className="h-full max-h-[320px] w-full" />
        </div>
      )}
      <p className="mt-2 shrink-0 bee-micro">{t("footnote", { count: dm.total })}</p>
    </OverviewCard>
  );
}

/** Row 1, right — how many leads fall in each style, one horizontal bar
 *  per style in magenta at 100 / 70 / 45 by rank, the fourth in the page
 *  grey. Counts and shares live in the hover title, not on the bar. */
export function AudienceMixBox({ mix: dm }: { mix: DiscMix }) {
  const t = useTranslations("probarNetworkBrandControl.brand.page.audience");
  const tDisc = useTranslations("probarNetworkBrandControl.brand.page.disc");
  const ranked = [...DISC_ORDER].sort((a, b) => dm.counts[b] - dm.counts[a]);
  const max = Math.max(1, ...DISC_ORDER.map((s) => dm.counts[s]));

  return (
    <OverviewCard span={7} title={t("title")} caption={t("caption")}>
      {dm.total === 0 ? (
        <EmptyLine>{t("empty")}</EmptyLine>
      ) : (
        <ul className="bee-fill flex min-h-0 flex-col justify-around">
          {ranked.map((s, rank) => {
            const count = dm.counts[s];
            const pct = Math.round((count / dm.total) * 100);
            return (
              <li key={s} className="bee-row" title={t("barTitle", { style: tDisc(`styles.${s}.name`), count, pct })}>
                <span className="w-9 shrink-0 text-sm font-bold">{s}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{tDisc(`styles.${s}.name`)}</span>
                  <span className="block truncate bee-micro">{tDisc(`styles.${s}.who`)}</span>
                </span>
                <span className="w-1/2 shrink-0 sm:w-2/5">
                  <span className="block h-3 overflow-hidden rounded-full" style={{ background: REST }} aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: count > 0 ? level(HUE, rank) : REST }} />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 shrink-0 bee-micro">{t("footnote")}</p>
    </OverviewCard>
  );
}

/** Row 2 — pick a style, see what BEE changes: tone, length, what it
 *  strips, and a typical opener. */
export function DiscAdaptationBox({ mix: dm }: { mix: DiscMix }) {
  const t = useTranslations("probarNetworkBrandControl.brand.page.disc");
  const [chosen, setChosen] = useState<DiscLetter | null>(null);
  const style: DiscLetter = chosen ?? dm.top ?? "D";
  const prefs = STYLE_PREFERENCES[style];
  const lengthFraction = LENGTH_FRACTION[prefs.length] ?? 2 / 3;
  const pct = dm.total > 0 ? Math.round((dm.counts[style] / dm.total) * 100) : null;

  return (
    <OverviewCard span={4} title={t("title")} caption={t("caption")}>
      <div className="bee-fill flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("title")}>
          {DISC_ORDER.map((s) => (
            <Pill key={s} pressed={s === style} fill={tint(HUE, 45)} onClick={() => setChosen(s)}>
              {s}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t(`styles.${style}.name`)}</p>
            <p className="bee-caption truncate">{t(`styles.${style}.who`)}</p>
          </div>
          {pct !== null && (
            <StateChip hue={HUE} level={45}>
              {t("shareOfLeads", { count: dm.counts[style], pct })}
            </StateChip>
          )}
        </div>
        <p className="bee-caption" title={t(`styles.${style}.how`)}>
          {t(`styles.${style}.how`)}
        </p>
        <ul>
          <li className="bee-row justify-between">
            <span className="bee-caption">{t("toneLabel")}</span>
            <span className="text-sm font-medium">{t(`styles.${style}.tone`)}</span>
          </li>
          <li className="bee-row justify-between">
            <span className="bee-caption">{t("lengthLabel")}</span>
            <span className="flex items-center gap-2">
              <Meter value={lengthFraction} hue={HUE} className="w-16" />
              <span className="text-sm font-medium">{t(`length.${prefs.length}`)}</span>
            </span>
          </li>
          <li className="bee-row justify-between">
            <span className="shrink-0 bee-caption">{t("avoidLabel")}</span>
            <span className="min-w-0 truncate text-right text-sm" title={t(`styles.${style}.avoid`)}>
              {t(`styles.${style}.avoid`)}
            </span>
          </li>
        </ul>
        <div className="mt-auto rounded-[var(--radius-md)] px-3 py-2" style={{ background: REST }}>
          <p className="bee-caption">{t("exampleLabel")}</p>
          <p className="mt-0.5 text-sm italic">“{t(`styles.${style}.example`)}”</p>
        </div>
      </div>
    </OverviewCard>
  );
}
