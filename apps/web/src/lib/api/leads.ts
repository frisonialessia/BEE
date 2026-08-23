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

export interface LeadBulkResult {
  created_count: number;
  errors: Array<{ row: number; message: string }>;
}

export async function bulkCreateLeads(leads: LeadCreateIn[]): Promise<LeadBulkResult> {
  return apiFetch<LeadBulkResult>("/api/v1/leads/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leads }),
  });
}

export interface LeadDuplicateGroup {
  key: string;
  leads: Lead[];
}

export async function fetchLeadDuplicates(): Promise<FetchResult<LeadDuplicateGroup[]>> {
  try {
    const data = await apiFetch<LeadDuplicateGroup[]>("/api/v1/leads/duplicates", {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function mergeLeads(keepId: string, mergeId: string): Promise<Lead> {
  return apiFetch<Lead>("/api/v1/leads/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keep_id: keepId, merge_id: mergeId }),
  });
}
