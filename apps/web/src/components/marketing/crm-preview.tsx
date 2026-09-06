"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { SALES, mix, tint } from "@/components/charts/palette";
import type { Locale } from "@/i18n/locales";
import { CLOSED_OPPORTUNITY_STATUSES } from "@/types/domain";
import { getSampleBattlecards, getSampleOpportunities } from "@/lib/sample-data";

/**
 * A read-only miniature of the real CRM board (features/crm/crm-board.tsx).
 *
 * The founder's brief names the board as one of the four pieces of BEE that
 * already work, so the features page should show it rather than describe it.
 * This is the same shape — five columns, one BEE hue each, card intensity
 * from the score, no numbers on the cards, closed cards in green — with
 * everything interactive removed: no drag, no menus, no mutations, no
 * queries. Just the picture, from the same fixture the sandbox runs on.
 *
 * Deliberately NOT an import of the real board with a `readOnly` prop. That
 * board is wired to React Query, a drawer context and stage-move mutations;
 * dragging it onto a public marketing page would pull all of it behind a
 * flag that only this one caller sets, and every future change to the board
 * would have to keep the flag honest. A frozen copy of the layout is the
 * cheaper lie to maintain — and this one is 80 lines, not 400.
 *
 * Colour: STAGE_ACCENT's own hues, kept in the same order so the picture
 * matches the product; green appears on the closed column only, which is
 * the exception docs/DESIGN_BRIEF.md §2.2 already carves out for the board.
 */

const COLUMNS = [
  { key: "detected", accent: "var(--color-chart-3)" },
  { key: "ready_to_action", accent: "var(--color-chart-1)" },
  { key: "prioritized", accent: "var(--color-chart-6)" },
  { key: "in_progress", accent: "var(--color-chart-4)" },
  { key: "closed", accent: SALES.won },
] as const;

/** The card's fill: the column's hue at the score's intensity, 100/70/45. */
function intensity(score: number): 100 | 70 | 45 {
  return score >= 75 ? 100 : score >= 50 ? 70 : 45;
}

export function CrmPreview({ locale }: { locale: Locale }) {
  const t = useTranslations("crm.board");
  const tPreview = useTranslations("legalMarketing.funcionalidades.crmPreview");
  const activeLocale = (useLocale() as Locale) ?? locale;

  const byColumn = useMemo(() => {
    const opps = getSampleOpportunities(activeLocale);
    const names = new Map(getSampleBattlecards(activeLocale).map((c) => [c.opportunity_id, c.company.name]));
    return COLUMNS.map((col) => ({
      ...col,
      cards: opps
        // Same as the real board: the last column collects every terminal
        // status, the other four match their own stage exactly.
        .filter((o) =>
          col.key === "closed"
            ? CLOSED_OPPORTUNITY_STATUSES.includes(o.status)
            : o.status === col.key,
        )
        .slice(0, 4)
        .map((o) => ({
          id: o.id,
          // The board shows the account. Only opportunities without a
          // battlecard fall back to their own title, and those titles start
          // "Oportunidad: …" / "Opportunity: …" — a prefix that reads as
          // noise next to four columns of clean company names.
          name: names.get(o.id) ?? (o.title ?? "—").replace(/^(Oportunidad|Opportunity):\s*/i, ""),
          score: o.score,
        })),
    }));
  }, [activeLocale]);

  return (
    <div className="overflow-x-auto">
      {/* minmax so the five columns keep their proportions and scroll as a
          unit on a phone instead of squeezing into unreadable slivers. */}
      <div className="grid min-w-[52rem] gap-3" style={{ gridTemplateColumns: "repeat(5, minmax(9.5rem, 1fr))" }}>
        {byColumn.map((col) => (
          <div key={col.key} className="min-w-0">
            {/* Solid fill with ink on top — the board's own header, never a
                pale 10 % tint (DESIGN_BRIEF §2.2). */}
            <div
              className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
              style={{ background: col.accent }}
            >
              <h3 className="truncate text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--color-text)]">
                {t(`stages.${col.key}`)}
              </h3>
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--color-card)] text-[11px] font-semibold tabular-nums">
                {col.cards.length}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-2.5">
              {col.cards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: tint(col.accent, intensity(card.score)) }}
                >
                  {/* One line, truncated: a long account name must never
                      grow a card past its neighbours (§2.14). */}
                  <p className="truncate text-sm font-medium text-[var(--color-text)]" title={card.name}>
                    {card.name}
                  </p>
                </div>
              ))}
              {col.cards.length === 0 && (
                <div
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: mix(col.accent, 12) }}
                >
                  <p className="bee-micro">{tPreview("empty")}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
