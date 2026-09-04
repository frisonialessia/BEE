import type { Locale } from "@/i18n/locales";
import { localeTags } from "@/i18n/locales";
import { stripOpportunityTitlePrefix } from "@/lib/format";
import { isQuotaActive } from "@/lib/quotas";
import type { Quota } from "@/lib/api/quotas";
import type { TeamOut } from "@/types/auth";
import type { UserOut } from "@/types/auth";
import type { Company, Opportunity } from "@/types/domain";

const DAY_MS = 86_400_000;

export interface SalesMonth {
  label: string;
  value: number;
  count: number;
  current: boolean;
}

export interface SalesModel {
  currency: string;
  won: Opportunity[];
  total: number;
  avgTicket: number;
  avgCycle: number | null;
  months: SalesMonth[];
  cumulative: { label: string; value: number }[];
  thisMonth: SalesMonth;
  monthDelta: number | null;
  clientsDelta: number | null;
  goal: number | null;
  attainment: number | null;
  /** Won revenue by the account's sector inside the window, largest first. */
  sectors: SalesSector[];
  ledger: SalesLedgerRow[];
}

export interface SalesSector {
  name: string;
  value: number;
  count: number;
}

export interface SalesLedgerRow {
  id: string;
  title: string;
  company: string;
  sector: string;
  owner: string;
  ownerId: string | null;
  amount: number;
  closedAt: string;
  year: number;
  type: string;
}

/**
 * One reading of "what did we close" shared by the Ventas page and the
 * Ventas box on Resumen, so both show the same months, the same goal and
 * the same totals — the summary is a window onto the page, never a second
 * computation that could drift from it.
 */
export function buildSalesModel({
  opportunities,
  teams,
  quotas,
  companies,
  users,
  locale,
  now,
  months: MONTHS = 12,
}: {
  opportunities: Opportunity[];
  teams: TeamOut[];
  quotas: Quota[];
  companies: Company[];
  users: UserOut[];
  locale: Locale;
  now: number;
  months?: number;
}): SalesModel {
  const currency = teams[0]?.currency ?? "USD";
  const won = opportunities
    .filter((o) => o.status === "won" && o.closed_at)
    .sort((a, b) => (b.closed_at as string).localeCompare(a.closed_at as string));
  const total = won.reduce((s, o) => s + (o.amount ?? 0), 0);
  const avgTicket = won.length ? total / won.length : 0;
  const cycles = won.map((o) => (new Date(o.closed_at as string).getTime() - new Date(o.created_at).getTime()) / DAY_MS);
  const avgCycle = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;

  const monthFmt = new Intl.DateTimeFormat(localeTags[locale], { month: "short" });
  const months: SalesMonth[] = Array.from({ length: MONTHS }, (_, i) => {
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
  const monthDelta = lastMonth && lastMonth.value > 0 ? (thisMonth.value - lastMonth.value) / lastMonth.value : null;
  const clientsDelta = lastMonth && lastMonth.count > 0 ? (thisMonth.count - lastMonth.count) / lastMonth.count : null;

  const today = new Date(now);
  const teamGoal = quotas
    .filter((q) => q.team_id && isQuotaActive(q, today) && q.target_amount > 0)
    .reduce((s, q) => s + q.target_amount, 0);
  const userGoal = quotas
    .filter((q) => q.user_id && isQuotaActive(q, today) && q.target_amount > 0)
    .reduce((s, q) => s + q.target_amount, 0);
  const goal = teamGoal || userGoal || null;
  const attainment = goal ? thisMonth.value / goal : null;

  const companyById = new Map(companies.map((c) => [c.id, c]));
  const userById = new Map(users.map((u) => [u.id, u.full_name]));
  // Every won deal, newest first — the page filters and pages the list itself.
  const ledger: SalesLedgerRow[] = won.map((o) => {
    const company = o.company_id ? companyById.get(o.company_id) : undefined;
    return {
      id: o.id,
      title: stripOpportunityTitlePrefix(o.title),
      company: company?.name ?? "",
      sector: company?.industry ?? "",
      owner: o.assigned_to_user_id ? userById.get(o.assigned_to_user_id) ?? "" : "",
      ownerId: o.assigned_to_user_id ?? null,
      amount: o.amount ?? 0,
      closedAt: o.closed_at as string,
      year: new Date(o.closed_at as string).getFullYear(),
      type: o.opportunity_type ?? "new_logo",
    };
  });

  // Where the money came from in the window: the sector of each won
  // account, so the team sees which markets actually pay, not just who sold.
  const windowStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth() - (MONTHS - 1), 1).getTime();
  const bySector = new Map<string, SalesSector>();
  for (const row of ledger) {
    if (new Date(row.closedAt).getTime() < windowStart) continue;
    const name = row.sector;
    const s = bySector.get(name) ?? { name, value: 0, count: 0 };
    s.value += row.amount;
    s.count += 1;
    bySector.set(name, s);
  }
  const sectors = [...bySector.values()].sort((a, b) => b.value - a.value);

  return { currency, won, total, avgTicket, avgCycle, months, cumulative, thisMonth, monthDelta, clientsDelta, goal, attainment, sectors, ledger };
}
