"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { SALES, mix } from "@/components/charts/palette";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import type { Locale } from "@/i18n/locales";
import { formatAmount, formatDate } from "@/lib/i18n/format";
import type { SalesLedgerRow } from "@/lib/sales-model";

const PAGE = 25;
const ALL = "all";

/**
 * Todos los cierres — the ledger of every won deal, with the filters a
 * manager actually reaches for: the year (pills, one per year with a
 * close), who closed it, the sector, and a from/to date. The caption
 * restates the filtered set (deals and total) so the table always says
 * what it is summing; rows page in 25s and a click opens the deal.
 */
export function ClosedLedger({ rows, money }: { rows: SalesLedgerRow[]; money: (v: number, compact?: boolean) => string }) {
  const t = useTranslations("sales.ledger");
  const locale = useLocale() as Locale;
  const { openOpportunity } = useOpportunityDrawer();
  const [year, setYear] = useState<string>(ALL);
  const [owner, setOwner] = useState<string>(ALL);
  const [sector, setSector] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shown, setShown] = useState(PAGE);

  const years = useMemo(() => [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a), [rows]);
  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.ownerId && r.owner) m.set(r.ownerId, r.owner);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (year !== ALL && r.year !== Number(year)) return false;
        if (owner !== ALL && r.ownerId !== owner) return false;
        if (sector !== ALL && r.sector !== sector) return false;
        const day = r.closedAt.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      }),
    [rows, year, owner, sector, from, to],
  );
  const total = filtered.reduce((s, r) => s + r.amount, 0);
  const active = year !== ALL || owner !== ALL || sector !== ALL || from !== "" || to !== "";

  function reset() {
    setYear(ALL);
    setOwner(ALL);
    setSector(ALL);
    setFrom("");
    setTo("");
    setShown(PAGE);
  }

  if (rows.length === 0) return <p className="bee-caption py-8 text-center">{t("empty")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("filters.year")} className="flex flex-wrap items-center gap-1">
          {[ALL, ...years.map(String)].map((y) => (
            <button key={y} type="button" aria-pressed={year === y} onClick={() => { setYear(y); setShown(PAGE); }} className="bee-btn-ghost bee-drawer-pill !h-7 !min-w-0 !px-2.5 !text-xs">
              {y === ALL ? t("filters.allYears") : y}
            </button>
          ))}
        </div>
        <select value={owner} onChange={(e) => { setOwner(e.target.value); setShown(PAGE); }} aria-label={t("filters.owner")} className="bee-input !h-7 !w-auto !text-xs">
          <option value={ALL}>{t("filters.allOwners")}</option>
          {owners.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        {sectors.length > 0 && (
          <select value={sector} onChange={(e) => { setSector(e.target.value); setShown(PAGE); }} aria-label={t("filters.sector")} className="bee-input !h-7 !w-auto !text-xs">
            <option value={ALL}>{t("filters.allSectors")}</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1 bee-micro">
          {t("filters.from")}
          <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setShown(PAGE); }} className="bee-input !h-7 !w-auto !text-xs" />
        </label>
        <label className="flex items-center gap-1 bee-micro">
          {t("filters.to")}
          <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setShown(PAGE); }} className="bee-input !h-7 !w-auto !text-xs" />
        </label>
        {active && (
          <button type="button" onClick={reset} className="bee-btn-text !h-7 !text-xs">
            {t("filters.clear")}
          </button>
        )}
        <p className="bee-caption ml-auto tabular-nums">{t("summary", { count: filtered.length, total: formatAmount(total, locale) })}</p>
      </div>

      {filtered.length === 0 ? (
        <p className="bee-caption py-8 text-center">{t("noMatch")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left">
                {(["date", "deal", "company", "sector", "owner", "amount"] as const).map((k) => (
                  <th key={k} className={`bee-micro pb-2 font-medium uppercase tracking-wide${k === "amount" ? " text-right" : ""}`}>{t(`cols.${k}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, shown).map((row) => (
                <tr key={row.id} onClick={() => openOpportunity(row.id)} className="cursor-pointer border-t border-[color-mix(in_srgb,var(--color-text)_6%,transparent)] hover:bg-[#b4e8c5]/40">
                  <td className="bee-micro py-2 pr-3 whitespace-nowrap">{formatDate(row.closedAt, locale)}</td>
                  <td className="max-w-[18rem] truncate py-2 pr-3 font-medium">{row.title}</td>
                  <td className="py-2 pr-3">{row.company || "—"}</td>
                  <td className="py-2 pr-3">{row.sector || "—"}</td>
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
      {filtered.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="bee-btn-ghost self-center !text-xs">
          {t("showMore", { count: filtered.length - shown })}
        </button>
      )}
    </div>
  );
}
