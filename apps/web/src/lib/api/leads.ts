import { apiFetch } from "@/lib/api/client";
import type { FetchResult } from "@/types/api";
import type { Lead } from "@/types/domain";

export async function fetchLeads(limit = 50): Promise<FetchResult<Lead[]>> {
  try {
    const data = await apiFetch<Lead[]>(`/api/v1/leads?limit=${limit}`, {
      next: { revalidate: 15 },
    });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export interface LeadCreateIn {
  full_name: string;
  company_id?: string;
  email?: string;
  title?: string;
  seniority?: string;
  linkedin_url?: string;
  phone?: string;
}

export async function createLead(body: LeadCreateIn): Promise<Lead> {
  return apiFetch<Lead>("/api/v1/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
