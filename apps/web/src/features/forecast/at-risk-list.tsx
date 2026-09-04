"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { TONE, tint } from "@/components/charts/palette";
import { useRowCapacity } from "@/components/charts/use-row-capacity";
import { CardLink, OverviewCard } from "@/components/dashboard/overview-card";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import type { Locale } from "@/i18n/locales";
import type { AtRiskOpportunity } from "@/lib/forecast";
import { stripOpportunityTitlePrefix } from "@/lib/format";
import { formatDate } from "@/lib/i18n/format";
import type { Company } from "@/types/domain";

/** One .bee-row of a single text-sm line: 10 + 20 + 10 padding/line; the hairline is the 1px gap. */
const ROW_HEIGHT = 40;
const ROW_GAP = 1;
/** Rows shown before "Ver todo" — the desktop cap of the collapsed list. */
const COLLAPSED_ROWS = 6;

/**
 * "Deals en riesgo" — the open deals the forecast counts on but should not:
 * no close date, an overdue one, or too little qualification for the stage.
 * Hairline rows (reason chip · company and title · amount · close date),
 * only the rows that fit while collapsed, "Ver todo" opens the rest; a
 * click opens the opportunity drawer. The chip is the one place the box's
 * magenta lives — text stays ink.
 */
export function AtRiskList({
  rows,
  companyById,
  money,
}: {
  rows: AtRiskOpportunity[];
  companyById: Map<string, Company>;
  money: (v: number) => string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("forecastWinLoss.forecast.atRiskSection");
  const { openOpportunity } = useOpportunityDrawer();
  const [expanded, setExpanded] = useState(false);
  const [listRef, capacity, desktop] = useRowCapacity<HTMLUListElement>(ROW_HEIGHT, ROW_GAP, { min: 4, max: COLLAPSED_ROWS });

  // Desktop: every row is rendered and the capped box clips at a row
  // boundary, so the measure never depends on what is shown (a list that
  // measures its own visible rows can only ever shrink). Phones: rows wrap
  // to two lines, so the list is cut by count instead.
  const capped = !expanded && desktop;
  const visible = expanded || desktop ? rows : rows.slice(0, capacity);
  const hasMore = rows.length > capacity;

  return (
    <OverviewCard
      span={12}
      title={t("title")}
      caption={t("caption")}
      action={
        hasMore ? (
          <CardLink onClick={() => setExpanded((v) => !v)}>{expanded ? t("showLess") : t("viewAll", { count: rows.length })}</CardLink>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="bee-caption py-6 text-center">{t("empty")}</p>
      ) : (
        <ul ref={listRef} className="flex shrink-0 flex-col overflow-hidden" style={capped ? { maxHeight: COLLAPSED_ROWS * (ROW_HEIGHT + ROW_GAP) } : undefined}>
          {visible.map(({ opportunity, reason }) => {
            const company = opportunity.company_id ? companyById.get(opportunity.company_id) : undefined;
            const closeDate = opportunity.expected_close_date ? formatDate(`${opportunity.expected_close_date}T00:00:00`, locale) : t("noDate");
            return (
              <li key={opportunity.id} className="bee-row">
                <button
                  type="button"
                  onClick={() => openOpportunity(opportunity.id)}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-sm)] text-left transition-colors hover:bg-[var(--color-primary)]/40 sm:flex-nowrap"
                >
                  <span className="order-2 min-w-0 flex-1 basis-0 truncate text-sm">
                    <span className="font-medium">{company?.name ?? t("noCompany")}</span>
                    <span className="bee-caption"> · {stripOpportunityTitlePrefix(opportunity.title)}</span>
                  </span>
                  <span className="order-3 shrink-0 text-sm tabular-nums sm:w-24 sm:text-right">{opportunity.amount !== null ? money(opportunity.amount) : t("noAmount")}</span>
                  {/* Phone: the chip and the date wrap under the name; desktop: the chip leads the row. */}
                  <span className="order-4 flex min-w-0 basis-full items-center gap-2 sm:order-1 sm:w-44 sm:shrink-0 sm:basis-auto">
                    <span className="bee-caption inline-block max-w-full truncate rounded-full px-2 leading-5 text-[var(--color-text)]" style={{ background: tint(TONE.urgency, 45) }}>
                      {t(`riskLabels.${reason}`)}
                    </span>
                    <span className="bee-caption shrink-0 sm:hidden">{closeDate}</span>
                  </span>
                  <span className="bee-caption order-5 hidden w-24 shrink-0 text-right sm:block">{closeDate}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}
