import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";
import type { FetchResult } from "@/types/api";

export interface IntegrationStatus {
  provider: string;
  label: string;
  connected: boolean;
  /** "organization" — a real per-account OAuth connection with its own
   *  Connect/Disconnect button. "server" — a single credential the whole
   *  deployment shares, shown read-only for transparency. */
  scope: "organization" | "server";
  /** "crm" | "email" | "social" | "automation" | "bi" | null — groups the
   *  page (see IntegrationsView.tsx). Untyped/optional on the wire, same
   *  reasoning as the backend's own IntegrationStatusOut.category. */
  category: string | null;
  account_email: string | null;
  connected_at: string | null;
  detail: string | null;
  last_error: string | null;
}

export type OAuthProvider = "gmail" | "linkedin" | "salesforce";

const READ_ONLY_MESSAGE = "Integraciones no está disponible en el sandbox — conecta una cuenta real desde el Dashboard.";

/** What every brand-new organization actually sees here — nothing
 *  connected yet, same providers and scopes as the real endpoint (see
 *  `list_integrations` in `app.api.v1.endpoints.integrations`). No fake
 *  "connected" state or invented account emails; the honest starting
 *  point is itself worth showing, since it's the same screen a just-
 *  registered account lands on. */
const DEMO_INTEGRATIONS: IntegrationStatus[] = [
  { provider: "gmail", label: "Gmail", connected: false, scope: "organization", category: "email", account_email: null, connected_at: null, detail: null, last_error: null },
  { provider: "linkedin", label: "LinkedIn", connected: false, scope: "organization", category: "social", account_email: null, connected_at: null, detail: null, last_error: null },
  { provider: "salesforce", label: "Salesforce", connected: false, scope: "organization", category: "crm", account_email: null, connected_at: null, detail: null, last_error: null },
  {
    provider: "email",
    label: "Email (SMTP)",
    connected: false,
    scope: "server",
    category: "email",
    account_email: null,
    connected_at: null,
    detail: "Credencial compartida del servidor, no por cuenta — se configura una sola vez para todo el despliegue.",
    last_error: null,
  },
  {
    provider: "twitter",
    label: "X / Twitter",
    connected: false,
    scope: "server",
    category: "social",
    account_email: null,
    connected_at: null,
    detail: "Credencial compartida del servidor, no por cuenta — se configura una sola vez para todo el despliegue.",
    last_error: null,
  },
];

export async function fetchIntegrations(): Promise<FetchResult<IntegrationStatus[]>> {
  if (isDemoMode()) return { data: DEMO_INTEGRATIONS, live: false };
  try {
    const data = await apiFetch<IntegrationStatus[]>("/api/v1/integrations", { cache: "no-store" });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function getOAuthAuthorizeUrl(provider: OAuthProvider): Promise<string> {
  if (isDemoMode()) throw new Error(READ_ONLY_MESSAGE);
  const { authorize_url } = await apiFetch<{ authorize_url: string }>(
    `/api/v1/integrations/${provider}/authorize`,
  );
  return authorize_url;
}

export async function disconnectOAuthProvider(provider: OAuthProvider): Promise<{ disconnected: boolean }> {
  if (isDemoMode()) throw new Error(READ_ONLY_MESSAGE);
  return apiFetch<{ disconnected: boolean }>(`/api/v1/integrations/${provider}/disconnect`, {
    method: "POST",
  });
}

export interface ImportCounts {
  created: number;
  updated: number;
  skipped: number;
}

export interface SalesforceImportSummary {
  companies: ImportCounts;
  leads: ImportCounts;
  opportunities: ImportCounts;
  errors: string[];
}

/** Trae Accounts/Contacts/Leads/Opportunities de Salesforce a BEE — solo
 * lectura, nunca escribe en Salesforce. Seguro de correr varias veces
 * (actualiza lo que ya importó en vez de duplicar). */
export async function importFromSalesforce(): Promise<SalesforceImportSummary> {
  if (isDemoMode()) throw new Error(READ_ONLY_MESSAGE);
  return apiFetch<SalesforceImportSummary>("/api/v1/integrations/salesforce/import", {
    method: "POST",
  });
}
