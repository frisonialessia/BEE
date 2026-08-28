import { apiFetch } from "@/lib/api/client";
import type { FetchResult } from "@/types/api";

export interface IcpCriteria {
  industries: string[];
  sizes: string[];
  countries: string[];
}

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
  return apiFetch<OrganizationProfile>("/api/v1/organizations/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchIcpCriteria(): Promise<FetchResult<IcpCriteria>> {
  try {
    const data = await apiFetch<IcpCriteria>("/api/v1/organizations/icp", { cache: "no-store" });
    return { data, live: true };
  } catch {
    return { data: { industries: [], sizes: [], countries: [] }, live: false };
  }
}

export async function updateIcpCriteria(body: IcpCriteria): Promise<IcpCriteria> {
  return apiFetch<IcpCriteria>("/api/v1/organizations/icp", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
