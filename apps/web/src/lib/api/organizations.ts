import { apiFetch } from "@/lib/api/client";
import { getDemoLocale } from "@/lib/demo/locale";
import { isDemoMode } from "@/lib/demo/mode";
import type { FetchResult } from "@/types/api";

export interface IcpCriteria {
  industries: string[];
  sizes: string[];
  countries: string[];
  revenue_ranges: string[];
  job_titles: string[];
  seniorities: string[];
  tech_keywords: string[];
}

/** Empty ICP — "not configured", never a fallback default with values in
 * it. Every dimension left out means "no opinion", not "nothing matches" —
 * see lib/icp.ts's isIcpConfigured/computeFitScore. */
export const EMPTY_ICP_CRITERIA: IcpCriteria = {
  industries: [],
  sizes: [],
  countries: [],
  revenue_ranges: [],
  job_titles: [],
  seniorities: [],
  tech_keywords: [],
};

/** Suggested revenue bands for the ICP form's helper text — unlike
 * EMPLOYEE_RANGES this isn't backend-validated (Company.revenue_range is
 * free text, same reasoning as Company.size), just a starting point. */
export const REVENUE_RANGE_SUGGESTIONS = [
  "<$1M",
  "$1M-$10M",
  "$10M-$50M",
  "$50M-$100M",
  "$100M-$500M",
  "$500M+",
] as const;

/** Fixed brackets — must match app.models.base.EmployeeRange on the
 * backend exactly (the API rejects anything else with a 422). */
export const EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;
export type EmployeeRange = (typeof EMPLOYEE_RANGES)[number];

export interface OrganizationProfile {
  industry: string | null;
  employee_range: EmployeeRange | null;
  website: string | null;
}

export interface OrganizationProfileIn {
  industry?: string | null;
  employee_range?: EmployeeRange | null;
  website?: string | null;
}

export async function fetchOrganizationProfile(): Promise<FetchResult<OrganizationProfile>> {
  try {
    const data = await apiFetch<OrganizationProfile>("/api/v1/organizations/profile", {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: { industry: null, employee_range: null, website: null }, live: false };
  }
}

export async function updateOrganizationProfile(
  body: OrganizationProfileIn,
): Promise<OrganizationProfile> {
  if (isDemoMode()) throw new Error("El sandbox no tiene una cuenta real que editar.");
  return apiFetch<OrganizationProfile>("/api/v1/organizations/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Read-only sandbox ICP — matches the seeded demo companies/leads/signals
 * closely enough that the Priority Matrix actually shows a mix of all four
 * quadrants instead of sitting on the "not configured" empty state, which a
 * visitor with no real account can't fill in themselves. Every value here
 * is chosen because it genuinely appears in the seed data (see
 * lib/demo/seed-history.ts, lib/sample-data.ts) — not padding for its own
 * sake. "stack" and the seniority tiers are identical in both locales
 * (jargon/raw codes, never translated); industries/countries/job title
 * keywords have real ES/EN pairs. */
function getDemoIcpCriteria(): IcpCriteria {
  const locale = getDemoLocale();
  if (locale === "en") {
    return {
      industries: ["Fintech", "Logistics", "Cloud infrastructure"],
      sizes: ["11-50", "51-200"],
      countries: ["Mexico", "Colombia"],
      revenue_ranges: ["$10M-$50M", "$50M-$100M"],
      job_titles: ["VP", "Head of", "Director"],
      seniorities: ["c_level", "vp"],
      tech_keywords: ["stack"],
    };
  }
  return {
    industries: ["Fintech", "Logística", "Infraestructura cloud"],
    sizes: ["11-50", "51-200"],
    countries: ["México", "Colombia"],
    revenue_ranges: ["$10M-$50M", "$50M-$100M"],
    job_titles: ["VP", "Director", "Gerente"],
    seniorities: ["c_level", "vp"],
    tech_keywords: ["stack"],
  };
}

export async function fetchIcpCriteria(): Promise<FetchResult<IcpCriteria>> {
  if (isDemoMode()) {
    // Pre-seeded and read-only in the sandbox (see updateIcpCriteria below)
    // — a visitor can't fill in their own ICP without a real account, so the
    // Priority Matrix demonstrates the feature with a realistic one instead
    // of sitting on the "not configured" empty state forever.
    return { data: getDemoIcpCriteria(), live: false };
  }
  try {
    const data = await apiFetch<IcpCriteria>("/api/v1/organizations/icp", { cache: "no-store" });
    return { data, live: true };
  } catch {
    return { data: { ...EMPTY_ICP_CRITERIA }, live: false };
  }
}

export async function updateIcpCriteria(body: IcpCriteria): Promise<IcpCriteria> {
  if (isDemoMode()) throw new Error("Priorización es de solo lectura en el sandbox.");
  return apiFetch<IcpCriteria>("/api/v1/organizations/icp", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface AutopilotConfig {
  enabled: boolean;
  confidence_threshold: number;
  excluded_company_ids: string[];
  forbidden_words: string[];
}

export interface AutopilotConfigIn {
  enabled: boolean;
  confidence_threshold: number;
  excluded_company_ids: string[];
  forbidden_words: string[];
}

export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  enabled: false,
  confidence_threshold: 0.9,
  excluded_company_ids: [],
  forbidden_words: [],
};

/** Real-org-only, same as the rest of /dashboard/team — there's no
 * autonomous-execution concept to demonstrate in a sandbox with no real
 * outbound channels connected, so this isn't wired into isDemoMode() at
 * all (unlike ICP criteria, which the sandbox pre-seeds read-only). */
export async function fetchAutopilotConfig(): Promise<AutopilotConfig> {
  return apiFetch<AutopilotConfig>("/api/v1/organizations/autopilot", { cache: "no-store" });
}

export async function updateAutopilotConfig(body: AutopilotConfigIn): Promise<AutopilotConfig> {
  return apiFetch<AutopilotConfig>("/api/v1/organizations/autopilot", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
