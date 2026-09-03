import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";
import { demoFetchCompanies, demoFetchCompany, demoGetCompanyBrief, demoResearchCompany } from "@/lib/demo/store";
import type { FetchResult } from "@/types/api";
import type { AccountActivityEvent, Company } from "@/types/domain";
import type { AccountBrief, AccountResearchResult } from "@/types/extended";

export interface CompanyCreateIn {
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  country?: string;
  website?: string;
  description?: string;
}

export interface CompanyUpdateIn {
  name?: string;
  domain?: string | null;
  industry?: string | null;
  size?: string | null;
  country?: string | null;
  revenue_range?: string | null;
  website?: string | null;
  description?: string | null;
  owner_user_id?: string | null;
}

export async function updateCompany(companyId: string, body: CompanyUpdateIn): Promise<Company> {
  if (isDemoMode()) {
    throw new Error("Empresas es de solo lectura en el sandbox.");
  }
  return apiFetch<Company>(`/api/v1/companies/${companyId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The sandbox never had real per-rep ownership or an activity trail to
 * begin with — an empty feed here reads as "nothing to show" (honest),
 * same convention as fetchUsers() in demo mode. */
export async function fetchCompanyActivity(
  companyId: string,
  limit = 20,
): Promise<FetchResult<AccountActivityEvent[]>> {
  if (isDemoMode()) return { data: [], live: false };
  try {
    const data = await apiFetch<AccountActivityEvent[]>(
      `/api/v1/companies/${companyId}/activity?limit=${limit}`,
      { cache: "no-store" },
    );
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function createCompany(body: CompanyCreateIn): Promise<Company> {
  if (isDemoMode()) {
    throw new Error(
      "Empresas es de solo lectura en el sandbox — usa \"Simula tu empresa\" desde el Resumen para agregar una.",
    );
  }
  return apiFetch<Company>("/api/v1/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchCompanies(limit = 50): Promise<FetchResult<Company[]>> {
  if (isDemoMode()) return { data: demoFetchCompanies().slice(0, limit), live: false };
  try {
    const data = await apiFetch<Company[]>(`/api/v1/companies?limit=${limit}`, {
      next: { revalidate: 15 },
    });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function fetchCompany(companyId: string): Promise<FetchResult<Company | null>> {
  if (isDemoMode()) return { data: demoFetchCompany(companyId) ?? null, live: false };
  try {
    const data = await apiFetch<Company>(`/api/v1/companies/${companyId}`, {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: null, live: false };
  }
}

export interface CompanyDuplicateGroup {
  key: string;
  companies: Company[];
}

export async function fetchCompanyDuplicates(): Promise<FetchResult<CompanyDuplicateGroup[]>> {
  if (isDemoMode()) return { data: [], live: false };
  try {
    const data = await apiFetch<CompanyDuplicateGroup[]>("/api/v1/companies/duplicates", {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

/** One untapped company BEE's vector store ranked as resembling this org's
 * closed-won book — see LookalikeService's docstring on the backend. */
export interface LookalikeCompany {
  company_id: string;
  name: string;
  industry: string | null;
  size: string | null;
  country: string | null;
  /** 0 (no resemblance) .. 1 (near-identical profile). */
  similarity: number;
}

/** The sandbox's demo companies are all built from seeded battlecards, so
 * every one of them already "has" an opportunity by construction — there is
 * no genuine untapped pool to rank, unlike a real org's pipeline. Same
 * "empty is honest, not a placeholder" convention as fetchCompanyActivity
 * above: nothing here rather than a fabricated result. */
export async function fetchLookalikeCompanies(limit = 8): Promise<FetchResult<LookalikeCompany[]>> {
  if (isDemoMode()) return { data: [], live: false };
  try {
    const data = await apiFetch<LookalikeCompany[]>(`/api/v1/companies/lookalikes?limit=${limit}`, {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function mergeCompanies(keepId: string, mergeId: string): Promise<Company> {
  if (isDemoMode()) {
    throw new Error("Empresas es de solo lectura en el sandbox.");
  }
  return apiFetch<Company>("/api/v1/companies/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keep_id: keepId, merge_id: mergeId }),
  });
}

// ── AccountResearchAgent ──────────────────────────────────────────────────────

/** Passive read — never triggers research on its own, just checks whether
 * a brief already exists (e.g. from a previous visit, or the owner-
 * reassignment auto-trigger — see companies.py's update_company). */
export async function fetchCompanyBrief(companyId: string): Promise<FetchResult<AccountBrief | null>> {
  if (isDemoMode()) return { data: demoGetCompanyBrief(companyId), live: false };
  try {
    const data = await apiFetch<AccountBrief | null>(`/api/v1/companies/${companyId}/brief`, {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: null, live: false };
  }
}

/** The explicit "Investigate this account" action. Never throws on a
 * disabled deployment or an exhausted daily budget — see
 * AccountResearchAgent.research's own docstring — those come back as
 * `disabled`/`budget_exceeded` flags on the result, not an error. */
export async function researchCompany(
  companyId: string,
  force = false,
): Promise<AccountResearchResult> {
  if (isDemoMode()) return demoResearchCompany(companyId, force);
  return apiFetch<AccountResearchResult>(
    `/api/v1/companies/${companyId}/research?force=${force}`,
    { method: "POST" },
  );
}
