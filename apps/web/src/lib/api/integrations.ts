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
  account_email: string | null;
  connected_at: string | null;
  detail: string | null;
  last_error: string | null;
}

export type OAuthProvider = "gmail" | "linkedin" | "salesforce";

const READ_ONLY_MESSAGE = "Integraciones no está disponible en el sandbox — conecta una cuenta real desde el Dashboard.";

export async function fetchIntegrations(): Promise<FetchResult<IntegrationStatus[]>> {
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
