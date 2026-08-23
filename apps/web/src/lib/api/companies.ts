import { apiFetch } from "@/lib/api/client";
import type { FetchResult } from "@/types/api";
import type { Company } from "@/types/domain";

export async function fetchCompanies(limit = 50): Promise<FetchResult<Company[]>> {
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
  try {
    const data = await apiFetch<Company>(`/api/v1/companies/${companyId}`, {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: null, live: false };
  }
}
