import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";
import { demoFetchLeads } from "@/lib/demo/store";
import type { FetchResult } from "@/types/api";
import type { Lead, LeadPipelineStage, LeadStatus } from "@/types/domain";

/** Leads (like Companies) is read-only in the sandbox — see
 * lib/demo/store.ts's "Companies / Leads" section for why there's no
 * demoCreateLead. Every mutation below throws the same clear message in
 * demo mode instead of silently hitting the real API (which would 401 and
 * surface a confusing generic error). */
const READ_ONLY_MESSAGE =
  "Leads es de solo lectura en el sandbox — usa \"Simula tu empresa\" desde el Resumen para agregar uno.";

export async function fetchLeads(limit = 50): Promise<FetchResult<Lead[]>> {
  if (isDemoMode()) return { data: demoFetchLeads().slice(0, limit), live: false };
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
  estimated_value?: number;
  source?: string;
  next_meeting_at?: string;
  photo_url?: string;
  // Unset: saved as a plain contact, no Opportunity — today's behavior.
  // Set: an Opportunity is created in this stage. Combined with
  // ai_context: blank saves straight there with no AI call ("sin IA");
  // filled in triggers StrategyGeneratorService, same as a manually
  // created Opportunity's own description field ("con IA").
  pipeline_stage?: LeadPipelineStage;
  ai_context?: string;
}

export async function createLead(body: LeadCreateIn): Promise<Lead> {
  if (isDemoMode()) throw new Error(READ_ONLY_MESSAGE);
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
  if (isDemoMode()) throw new Error(READ_ONLY_MESSAGE);
  return apiFetch<LeadBulkResult>("/api/v1/leads/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leads }),
  });
}

export interface LeadImportRow {
  full_name?: string;
  email?: string;
  title?: string;
  seniority?: string;
  linkedin_url?: string;
  phone?: string;
  company_name?: string;
  company_domain?: string;
  company_industry?: string;
  company_country?: string;
}

export interface LeadImportRowOutcome {
  row: number;
  status: "created" | "matched_existing" | "error";
  lead_id: string | null;
  company_id: string | null;
  message: string | null;
}

export interface LeadImportResult {
  total_rows: number;
  leads_created: number;
  leads_matched: number;
  companies_created: number;
  companies_matched: number;
  skipped: number;
  rows: LeadImportRowOutcome[];
}

/** El path real para "sube tu lista de prospectos externos" — a diferencia
 *  de `bulkCreateLeads` (que exige un `company_id` interno que quien sube
 *  el archivo no puede tener), esto resuelve la empresa por nombre/dominio
 *  igual que la ingesta de señales. */
export async function importLeads(rows: LeadImportRow[]): Promise<LeadImportResult> {
  if (isDemoMode()) throw new Error(READ_ONLY_MESSAGE);
  return apiFetch<LeadImportResult>("/api/v1/leads/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
}

export interface LeadDuplicateGroup {
  key: string;
  leads: Lead[];
}

export async function fetchLeadDuplicates(): Promise<FetchResult<LeadDuplicateGroup[]>> {
  // Honest empty, not fabricated duplicates — same rationale as
  // fetchCompanyDuplicates (companies.ts), documented explicitly here
  // instead of falling through the catch block below.
  if (isDemoMode()) return { data: [], live: false };
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
  if (isDemoMode()) throw new Error(READ_ONLY_MESSAGE);
  return apiFetch<Lead>("/api/v1/leads/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keep_id: keepId, merge_id: mergeId }),
  });
}

export interface LeadValidationOut {
  lead_id: string;
  flags: string[];
  freshness_score: number;
  stale_risk: boolean;
  validated_at: string;
}

export async function validateLead(leadId: string): Promise<LeadValidationOut> {
  if (isDemoMode()) throw new Error(READ_ONLY_MESSAGE);
  return apiFetch<LeadValidationOut>(`/api/v1/leads/${leadId}/validate`, {
    method: "POST",
  });
}

export interface LeadBulkUpdateIn {
  ids: string[];
  status?: LeadStatus;
  assigned_to_user_id?: string | null;
}

export interface LeadBulkUpdateResult {
  updated_count: number;
  errors: Array<{ row: number; message: string }>;
}

export async function bulkUpdateLeads(body: LeadBulkUpdateIn): Promise<LeadBulkUpdateResult> {
  if (isDemoMode()) throw new Error(READ_ONLY_MESSAGE);
  return apiFetch<LeadBulkUpdateResult>("/api/v1/leads/bulk-update", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
