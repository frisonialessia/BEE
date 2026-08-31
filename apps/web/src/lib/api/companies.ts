import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";
import { demoFetchCompanies, demoFetchCompany } from "@/lib/demo/store";
import type { FetchResult } from "@/types/api";
import type { Company } from "@/types/domain";

export interface CompanyCreateIn {
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  country?: string;
  website?: string;
  description?: string;
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
