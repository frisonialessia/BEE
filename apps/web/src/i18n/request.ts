import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { detectLocaleFromAcceptLanguage } from "@/i18n/detect-locale";
import { defaultLocale, isLocale, localeTags, locales, type Locale } from "@/i18n/locales";
import { LOCALE_COOKIE } from "@/i18n/cookie";

/**
 * next-intl request config — **without i18n routing** (see next-intl's own
 * "App Router without i18n routing" guide). BEE's routes stay unprefixed
 * (`/dashboard`, `/probar`, ...) instead of moving under a `[locale]`
 * segment: the app already has 51 routes and ~190 components with
 * hardcoded internal links, a path-based demo-mode detector
 * (`lib/demo/mode.ts`'s `isDemoMode()`, which matches on `/probar`), and a
 * freshly-hardened auth/redirect setup — restructuring every route to gain
 * `/en/dashboard` URLs is a much bigger, riskier change than "remember the
 * visitor's language," and nothing in the request asked for localized
 * URLs. A cookie carries the preference instead; every route works
 * identically in both languages.
 *
 * Resolution order: cookie (an explicit choice from the language switcher,
 * or the header-derived choice `proxy.ts` already wrote on this visitor's
 * first request) → `Accept-Language` header (belt-and-suspenders for the
 * rare request `proxy.ts`'s matcher doesn't cover) → `defaultLocale`
 * (Spanish). The cookie is set by the server action in `i18n/actions.ts`,
 * or by `proxy.ts` for a first-time visitor who hasn't touched the
 * switcher yet — see that file's docstring for why setting it there
 * (not here) is what makes the demo/sandbox seed data agree with the
 * language this function resolves.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale: Locale = defaultLocale;
  if (cookieLocale && isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const acceptLanguage = (await headers()).get("accept-language");
    const matched = detectLocaleFromAcceptLanguage(acceptLanguage);
    if (matched) locale = matched;
  }

  return {
    locale,
    messages: (await loadMessages(locale)).default,
    // Named formats so every `useFormatter().number(value, "currencyUSD")`
    // call site shares one definition instead of repeating
    // `{style:"currency",currency:"USD"}` — see lib/i18n/format.ts, which
    // wraps these for use outside React (chart libraries, non-component
    // helpers) via next-intl's `createFormatter`.
    formats: {
      number: {
        currencyUSD: { style: "currency", currency: "USD" },
        percent: { style: "percent", maximumFractionDigits: 1 },
        compact: { notation: "compact", maximumFractionDigits: 1 },
      },
      dateTime: {
        short: { day: "numeric", month: "short" },
        medium: { day: "numeric", month: "short", year: "numeric" },
        monthYear: { month: "long", year: "numeric" },
        withTime: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
      },
    },
    timeZone: "America/Mexico_City",
  };
});

/** `Intl`-facing BCP-47 tag for the resolved locale — e.g. for a chart
 * library or anything reading `next-intl`'s locale outside a component. */
export function tagFor(locale: Locale): string {
  return localeTags[locale];
}

export { locales };

/** Messages are split by feature namespace (`messages/{locale}/nav.json`,
 * `.../dashboard.json`, ...) instead of one giant file per locale — the
 * app has 51 routes and ~190 components, and a single JSON file would turn
 * into a merge-conflict magnet the moment more than one page is being
 * translated at a time. Each namespace file is merged into one messages
 * object here; add a new one by adding it to this list, not by editing an
 * existing file. */
const NAMESPACES = [
  "common",
  "nav",
  "marketing",
  "auth",
  "crm",
  "dashboardOverview",
  "opportunitiesPriority",
  "signalsStrategies",
  "forecastWinLoss",
  "companiesLeads",
  "sharedB",
  "shared",
  "workspace",
  "legalMarketing",
  "landing",
  "probar",
] as const;

async function loadMessages(locale: Locale) {
  const modules = await Promise.all(
    NAMESPACES.map((ns) => import(`../../messages/${locale}/${ns}.json`)),
  );
  const messages = Object.fromEntries(NAMESPACES.map((ns, i) => [ns, modules[i].default]));
  return { default: messages };
}
