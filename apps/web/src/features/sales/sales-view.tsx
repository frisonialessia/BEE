"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AreaChart } from "@/components/charts/area-chart";
import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { SALES, mix } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { LiveBadge } from "@/components/live-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { TeamGoalRanking } from "@/features/dashboard/team-goal-ranking";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useQuotas } from "@/hooks/queries/use-quotas";
import { useTeams } from "@/hooks/queries/use-teams";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { localeTags } from "@/i18n/locales";
import { formatDate, formatMoney } from "@/lib/i18n/format";
import { stripOpportunityTitlePrefix } from "@/lib/format";
import { isQuotaActive } from "@/lib/quotas";

const DAY_MS = 86_400_000;
const MONTHS = 12;

/**
 * Ventas — every closed deal since the organization exists. The one page
 * where the green family lives (#52C871 won · #9CD147 lime · #B4E8C5 mint):
 * cumulative revenue, monthly bars against the team goal, the ranking with
 * goal rings, and the ledger of every won deal.
 */
export function SalesView() {
  const t = useTranslations("sales");
  const locale = useLocale() as Locale;
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 300);
  const { data: users } = useUsers();
  const { data: teamsData } = useTeams();
  const { data: quotasResult } = useQuotas();
  const { data: companiesResult } = useCompanies(300);
  const { openOpportunity } = useOpportunityDrawer();
  const [now] = useState(() => Date.now());

  const model = useMemo(() => {
    const opportunities = oppsResult?.data ?? [];
    const teams = teamsData ?? [];
    const quotas = quotasResult?.data ?? [];
    const currency = teams[0]?.currency ?? "USD";
    const won = opportunities
      .filter((o) => o.status === "won" && o.closed_at)
      .sort((a, b) => (b.closed_at as string).localeCompare(a.closed_at as string));
    const total = won.reduce((s, o) => s + (o.amount ?? 0), 0);
    const avgTicket = won.length ? total / won.length : 0;
    const cycles = won.map((o) => (new Date(o.closed_at as string).getTime() - new Date(o.created_at).getTime()) / DAY_MS);
    const avgCycle = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;

    const monthFmt = new Intl.DateTimeFormat(localeTags[locale], { month: "short" });
    const months = Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(now);
      d.setDate(1);
      d.setMonth(d.getMonth() - (MONTHS - 1 - i));
      const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const rows = won.filter((o) => {
        const c = new Date(o.closed_at as string).getTime();
        return c >= start && c < end;
      });
      return { label: monthFmt.format(d), value: rows.reduce((s, o) => s + (o.amount ?? 0), 0), count: rows.length, current: i === MONTHS - 1 };
    });
    let acc = 0;
    const cumulative = months.map((m) => ({ label: m.label, value: (acc += m.value) }));
    const thisMonth = months[MONTHS - 1];
    const lastMonth = months[MONTHS - 2];
    const monthDelta = lastMonth.value > 0 ? (thisMonth.value - lastMonth.value) / lastMonth.value : null;
    const clientsDelta = lastMonth.count > 0 ? (thisMonth.count - lastMonth.count) / lastMonth.count : null;

    const today = new Date(now);
    const teamGoal = quotas
      .filter((q) => q.team_id && isQuotaActive(q, today) && q.target_amount > 0)
      .reduce((s, q) => s + q.target_amount, 0);
    const userGoal = quotas
      .filter((q) => q.user_id && isQuotaActive(q, today) && q.target_amount > 0)
      .reduce((s, q) => s + q.target_amount, 0);
    const goal = teamGoal || userGoal || null;
    const attainment = goal ? thisMonth.value / goal : null;

    const companyById = new Map((companiesResult?.data ?? []).map((c) => [c.id, c.name]));
    const userById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
    const ledger = won.slice(0, 60).map((o) => ({
      id: o.id,
      title: stripOpportunityTitlePrefix(o.title),
      company: o.company_id ? companyById.get(o.company_id) ?? "" : "",
      owner: o.assigned_to_user_id ? userById.get(o.assigned_to_user_id) ?? "" : "",
      amount: o.amount ?? 0,
      closedAt: o.closed_at as string,
      type: o.opportunity_type ?? "new_logo",
    }));

    return { currency, won, total, avgTicket, avgCycle, months, cumulative, thisMonth, monthDelta, clientsDelta, goal, attainment, ledger };
  }, [oppsResult, teamsData, quotasResult, companiesResult, users, locale, now]);

  const money = (v: number, compact = true) => formatMoney(v, model.currency, locale, compact);
  const live = oppsResult?.live ?? false;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="bee-display mt-1">{t("title")}</h1>
          <p className="bee-caption mt-1">{t("subtitle")}</p>
        </div>
        <LiveBadge live={live} />
      </header>

      <StatStrip cols={4}>
        <StatTile label={t("kpis.total")} value={money(model.total)} hint={t("kpis.since", { count: model.won.length })} trend={model.months.map((m) => m.value)} tone={SALES.won} formatValue={(v) => money(v)} />
        <StatTile label={t("kpis.month")} value={money(model.thisMonth.value)} delta={model.monthDelta} deltaLabel={t("kpis.vsLastMonth")} salesTone tone={SALES.won} trend={model.months.slice(-8).map((m) => m.value)} formatValue={(v) => money(v)} />
        <StatTile label={t("kpis.clients")} value={model.thisMonth.count} delta={model.clientsDelta} deltaLabel={t("kpis.vsLastMonth")} salesTone tone={SALES.lime} trend={model.months.slice(-8).map((m) => m.count)} formatValue={(v) => String(Math.round(v))} />
        {model.goal ? (
          <StatTile label={t("kpis.goal")} value={`${Math.round((model.attainment ?? 0) * 100)}%`} hint={t("kpis.goalOf", { goal: money(model.goal) })} progress={model.attainment ?? 0} tone={(model.attainment ?? 0) >= 1 ? SALES.won : SALES.lime} />
        ) : (
          <StatTile label={t("kpis.ticket")} value={money(model.avgTicket)} hint={model.avgCycle === null ? t("kpis.noCycle") : t("kpis.cycle", { days: Math.round(model.avgCycle) })} tone={SALES.mint} />
        )}
      </StatStrip>

      <div className="bee-overview">
        <OverviewCard span={8} title={t("cumulative.title")} caption={t("cumulative.caption")}>
          <AreaChart points={model.cumulative} color={SALES.won} minHeight={200} formatValue={(v) => money(v)} />
        </OverviewCard>
        <OverviewCard span={4} title={t("monthly.title")} caption={model.goal ? t("monthly.captionGoal", { goal: money(model.goal) }) : t("monthly.caption")}>
          <BarsVsTarget
            points={model.months.slice(-6)}
            target={model.goal}
            color={SALES.lime}
            hitColor={SALES.won}
            targetLabel={model.goal ? t("monthly.goalLabel") : undefined}
            minHeight={200}
            formatValue={(v) => money(v)}
          />
        </OverviewCard>

        <OverviewCard span={4} title={t("ranking.title")} caption={t("ranking.caption")}>
          <TeamGoalRanking month sales limit={5} />
        </OverviewCard>
        <OverviewCard span={8} title={t("ledger.title")} caption={t("ledger.caption", { count: model.won.length })}>
          {model.ledger.length === 0 ? (
            <p className="bee-caption py-8 text-center">{t("ledger.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left">
                    {(["date", "deal", "company", "owner", "amount"] as const).map((k) => (
                      <th key={k} className="bee-micro pb-2 font-medium uppercase tracking-wide">{t(`ledger.cols.${k}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.ledger.map((row) => (
                    <tr key={row.id} onClick={() => openOpportunity(row.id)} className="cursor-pointer border-t border-[color-mix(in_srgb,var(--color-text)_6%,transparent)] hover:bg-[#b4e8c5]/40">
                      <td className="bee-micro py-2 pr-3 whitespace-nowrap">{formatDate(row.closedAt, locale)}</td>
                      <td className="max-w-[16rem] truncate py-2 pr-3 font-medium">{row.title}</td>
                      <td className="py-2 pr-3">{row.company || "—"}</td>
                      <td className="py-2 pr-3">{row.owner || "—"}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">
                        <span className="rounded-full px-2 py-0.5" style={{ background: mix(SALES.mint, 60) }}>{money(row.amount, false)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OverviewCard>
      </div>
    </div>
  );
}
