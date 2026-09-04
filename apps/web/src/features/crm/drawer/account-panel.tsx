"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { REST, TONE, level, tint } from "@/components/charts/palette";
import { StackedBars, type StackedPoint } from "@/components/charts/stacked-bars";
import type { Locale } from "@/i18n/locales";
import { localeTags } from "@/i18n/locales";
import { getSignalTypeLabels } from "@/lib/format";
import type { Company, Meeting, Opportunity, Signal } from "@/types/domain";

import { countByStep } from "./account-stats";
import { STEP_ORDER, type StepKey } from "./stage-meta";

const WEEKS = 12;
const WEEK_MS = 7 * 86_400_000;
const DAYS_90 = 90 * 86_400_000;

/** Signals belong to an account by id, or by name when the id is missing. */
function ofCompany(signal: Signal, company: Company): boolean {
  if (signal.company_id) return signal.company_id === company.id;
  return signal.title.toLowerCase().includes(company.name.toLowerCase());
}

/**
 * What BEE knows about the account, as three boxes — the same three in
 * create mode (with the draft counted in) and in view mode:
 *  · at a glance: signals in 90 days, meetings, deals, each bar against the
 *    most active account in the org, so the width means something;
 *  · the account's signals per week, stacked by type (honey);
 *  · the account's deals by stage (lilac).
 */
export function AccountPanel({
  company,
  accountOpps,
  allOpps,
  signals,
  meetings,
  draftStep,
  emptyHint,
  compact = false,
}: {
  company: Company | null;
  accountOpps: Opportunity[];
  allOpps: Opportunity[];
  signals: Signal[];
  meetings: Meeting[];
  /** Create mode: the stage the draft would land in, counted as one more. */
  draftStep?: StepKey;
  emptyHint: string;
  /** One column (the narrow pane of view mode). */
  compact?: boolean;
}) {
  const t = useTranslations("crm.drawer.account");
  const tStages = useTranslations("crm.board.stages");
  const locale = useLocale() as Locale;
  const typeLabels = getSignalTypeLabels(locale);
  const [now] = useState(() => Date.now());

  const accountSignals = useMemo(() => (company ? signals.filter((s) => ofCompany(s, company)) : []), [signals, company]);
  const oppIds = useMemo(() => new Set(accountOpps.map((o) => o.id)), [accountOpps]);
  const leadIds = useMemo(() => new Set(accountOpps.map((o) => o.lead_id).filter(Boolean)), [accountOpps]);
  const accountMeetings = useMemo(
    () => meetings.filter((m) => (m.opportunity_id && oppIds.has(m.opportunity_id)) || (m.lead_id && leadIds.has(m.lead_id))),
    [meetings, oppIds, leadIds],
  );

  // Org-wide maxima so each bar is "this account against the most active".
  const maxima = useMemo(() => {
    const sig = new Map<string, number>();
    for (const s of signals) if (s.company_id && new Date(s.detected_at).getTime() >= now - DAYS_90) sig.set(s.company_id, (sig.get(s.company_id) ?? 0) + 1);
    const opp = new Map<string, number>();
    const oppCompany = new Map<string, string>();
    for (const o of allOpps) if (o.company_id) { opp.set(o.company_id, (opp.get(o.company_id) ?? 0) + 1); oppCompany.set(o.id, o.company_id); }
    const meet = new Map<string, number>();
    for (const m of meetings) { const c = m.opportunity_id ? oppCompany.get(m.opportunity_id) : null; if (c) meet.set(c, (meet.get(c) ?? 0) + 1); }
    return { signals: Math.max(1, ...sig.values()), opps: Math.max(1, ...opp.values()), meetings: Math.max(1, ...meet.values()) };
  }, [signals, allOpps, meetings, now]);

  const recentSignals = accountSignals.filter((s) => new Date(s.detected_at).getTime() >= now - DAYS_90).length;
  const glance = [
    { label: t("glance.signals"), value: recentSignals, max: maxima.signals, fill: TONE.market },
    { label: t("glance.meetings"), value: accountMeetings.length, max: maxima.meetings, fill: tint(TONE.market, 70) },
    { label: t("glance.deals"), value: accountOpps.length + (draftStep ? 1 : 0), max: Math.max(maxima.opps, accountOpps.length + 1), fill: tint(TONE.market, 45) },
  ];

  // Weekly signals stacked by the account's three most common types.
  const weekly = useMemo(() => {
    const byType = new Map<string, number>();
    for (const s of accountSignals) byType.set(s.signal_type, (byType.get(s.signal_type) ?? 0) + 1);
    const top = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    const fmt = new Intl.DateTimeFormat(localeTags[locale], { day: "numeric", month: "short" });
    const points: StackedPoint[] = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      const to = now - i * WEEK_MS;
      const rows = accountSignals.filter((s) => { const d = new Date(s.detected_at).getTime(); return d > to - WEEK_MS && d <= to; });
      const parts = top.map((k) => rows.filter((s) => s.signal_type === k).length);
      parts.push(rows.filter((s) => !top.includes(s.signal_type)).length);
      points.push({ label: fmt.format(new Date(to - WEEK_MS)), parts, current: i === 0 });
    }
    const legend = top.map((k) => typeLabels[k as keyof typeof typeLabels] ?? k);
    if (points.some((p) => p.parts[p.parts.length - 1] > 0)) legend.push(t("other"));
    return { points, legend };
  }, [accountSignals, locale, now, typeLabels, t]);

  const byStep = useMemo(() => countByStep(accountOpps), [accountOpps]);
  const funnelRows = STEP_ORDER.map((s, i) => ({
    label: tStages(s),
    value: byStep[s] + (draftStep === s ? 1 : 0),
    color: i < 3 ? level(TONE.prepared, i) : REST,
  }));
  const hasSignals = accountSignals.length > 0;

  return (
    <div className={compact ? "grid min-h-0 grid-cols-1 gap-4" : "grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 sm:grid-rows-[auto_minmax(0,1fr)]"}>
      <Box title={t("glance.title")} caption={company ? t("glance.caption", { company: company.name }) : emptyHint} className={compact ? "" : "sm:col-span-2"}>
        <div className="grid gap-2.5">
          {glance.map((g) => (
            <div key={g.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate">{g.label}</span>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: REST }}>
                <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, Math.round((g.value / g.max) * 100))}%`, background: g.fill }} />
              </div>
              <span className="w-8 text-right font-semibold tabular-nums">{company ? g.value : "—"}</span>
            </div>
          ))}
        </div>
      </Box>
      <Box title={t("signals")} caption={t("signalsCaption", { weeks: WEEKS })}>
        {hasSignals ? <StackedBars points={weekly.points} legend={weekly.legend} tone={TONE.market} minHeight={150} /> : <Empty hint={company ? t("noSignals") : emptyHint} />}
      </Box>
      <Box title={t("closeBy")} caption={company ? t("byStage", { count: accountOpps.length + (draftStep ? 1 : 0) }) : emptyHint}>
        {company ? <HorizontalFunnel rows={funnelRows} /> : <Empty hint={emptyHint} />}
      </Box>
    </div>
  );
}

function Box({ title, caption, className, children }: { title: string; caption?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`bee-card !min-h-0 !p-5 ${className ?? ""}`}>
      <div className="bee-card__head !mb-3">
        <div className="min-w-0">
          <h3 className="bee-card-title !mb-0 truncate">{title}</h3>
          {caption && <p className="bee-caption truncate">{caption}</p>}
        </div>
      </div>
      <div className="bee-card__body">{children}</div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="bee-fill grid min-h-28 place-items-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)]">
      <p className="bee-caption px-4 text-center">{hint}</p>
    </div>
  );
}
