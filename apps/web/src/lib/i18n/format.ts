/**
 * Centralized locale-aware number/currency/date formatting — the single
 * place every component should reach for `Intl.NumberFormat`/
 * `Intl.DateTimeFormat` instead of constructing one inline.
 *
 * Before this file existed, ~19 files across the app each built their own
 * `Intl.NumberFormat("es-MX", ...)`/`.toLocaleDateString("es-MX", ...)`
 * instance, and about half of those omitted the locale argument entirely
 * (silently following whatever the *browser's* locale happens to be,
 * independent of the language the user picked in BEE). Once a second
 * language existed, both groups broke the same way: a hardcoded "es-MX"
 * ignores the switcher; a missing locale argument makes formatting
 * inconsistent between visitors even in the same language. These
 * functions take the resolved BEE locale explicitly — get it from
 * `useLocale()` (client components) or `getLocale()` (server components),
 * both from `next-intl` — so there is exactly one source of truth for
 * "what locale is this render in," matching the language switcher instead
 * of a machine setting nobody here controls.
 *
 * Currency is always USD per product decision — BEE prices and reports
 * pipeline value in USD regardless of the visitor's language; only the
 * *number formatting* (grouping separators, decimal style, symbol
 * placement) changes between locales, not the currency itself.
 */
import { localeTags, type Locale } from "@/i18n/locales";

function tag(locale: Locale): string {
  return localeTags[locale];
}

/** "$1,234" (es-MX) / "$1,234" (en-US) — whole-dollar USD, the precision
 *  every currency figure in the dashboard already used before i18n (deal
 *  amounts, pipeline value, quotas — none of these need cents). */
export function formatCurrencyUSD(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(tag(locale), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Same as {@link formatCurrencyUSD}, but keeps cents — for the rare figure
 *  precise to the cent instead of the dollar (a unit price, not a deal
 *  size). Most call sites want the whole-dollar version above. */
export function formatCurrencyUSDPrecise(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(tag(locale), { style: "currency", currency: "USD" }).format(amount);
}

/** "$1.2M" / "$450K" — compact notation, for a large projected figure
 *  (annual/monthly revenue projections, simulator output) where the full
 *  digit count would be harder to scan than the magnitude at a glance. */
export function formatCurrencyUSDCompact(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(tag(locale), {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(tag(locale), options).format(value);
}

/** "42%" — expects a 0-1 ratio (0.42), not a 0-100 number; matches how
 *  win rates/confidence scores are already stored across the codebase. */
export function formatPercent(ratio: number, locale: Locale, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(tag(locale), { style: "percent", maximumFractionDigits }).format(ratio);
}

function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** "15 sept" (es) / "Sep 15" (en) — the short day+month format used for
 *  chart axis labels and compact date chips across the dashboard. */
export function formatShortDate(value: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short" }).format(toDate(value));
}

/** "15 sept 2026" / "Sep 15, 2026" — the default for "when did this
 *  happen" copy (created_at, closed_at, due dates, ...). */
export function formatDate(value: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", year: "numeric" }).format(
    toDate(value),
  );
}

/** "septiembre 2026" / "September 2026" — month-granularity axis labels
 *  (forecast/trend charts bucket by month, not by day). */
export function formatMonthYear(value: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), { month: "long", year: "numeric" }).format(toDate(value));
}

/** "15 sept, 14:30" / "Sep 15, 2:30 PM" — date plus time, for anything
 *  logged with second-level relevance (audit entries, DLQ attempts). */
export function formatDateTime(value: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(toDate(value));
}

/** "05 sept, 14:30" / "Sep 05, 2:30 PM" — same as {@link formatDateTime}
 *  but zero-padded day/hour, for a fixed-width timeline column where a
 *  jumping "5" vs "15" would misalign the rows next to it. */
export function formatDateTimePadded(value: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(toDate(value));
}

/** "15 de septiembre de 2026" / "September 15, 2026" — full month name, for
 *  a prose-style date (a prediction summary, a formal timestamp) where the
 *  abbreviated month in {@link formatDate} would read as too clipped. */
export function formatLongDate(value: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "long", year: "numeric" }).format(
    toDate(value),
  );
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

/** "hace 3h" / "3h ago" — replaces the old hardcoded-Spanish `timeAgo` in
 *  `lib/format.ts` with a locale-aware one built on
 *  `Intl.RelativeTimeFormat`. Falls back to "ahora mismo"/"just now" under
 *  a minute, same threshold the old implementation used. */
export function formatRelativeTime(iso: string, locale: Locale, now: Date = new Date()): string {
  const diffSeconds = Math.round((toDate(iso).getTime() - now.getTime()) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) {
    return locale === "es" ? "ahora mismo" : "just now";
  }

  const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: "always", style: "short" });
  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (absSeconds >= secondsInUnit || unit === "minute") {
      const value = Math.round(diffSeconds / secondsInUnit);
      return rtf.format(value, unit);
    }
  }
  return rtf.format(Math.round(diffSeconds / 60), "minute");
}

/** Amount in the team's own currency (ISO 4217), compact when large. */
/**
 * An amount without its currency — the KPI tiles: the number is what
 * matters and the team's currency is set once in settings, not repeated in
 * every tile. Compact ("22 k") or full ("22,000").
 */
export function formatAmount(amount: number, locale: Locale, compact = true): string {
  try {
    return new Intl.NumberFormat(tag(locale), { notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 0 }).format(amount);
  } catch {
    return String(Math.round(amount));
  }
}

export function formatMoney(amount: number, currency: string, locale: Locale, compact = false): string {
  try {
    return new Intl.NumberFormat(tag(locale), {
      style: "currency",
      currency: currency || "USD",
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 0,
    }).format(amount);
  } catch {
    return formatCurrencyUSD(amount, locale);
  }
}
