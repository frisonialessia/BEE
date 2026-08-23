import { apiFetch } from "@/lib/api/client";
import type { FetchResult } from "@/types/api";

export interface IcpCriteria {
  industries: string[];
  sizes: string[];
  countries: string[];
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
