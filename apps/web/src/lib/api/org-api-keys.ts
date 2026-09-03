import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";
import type { FetchResult } from "@/types/api";

/** Organization API keys — the credential a BI tool, script, or webhook
 * caller presents as `X-BEE-Org-Key` (or `?org_key=` on a bare URL, see
 * the BI feed) to identify which organization it's acting on behalf of.
 * See app.models.organization_api_key / app.api.v1.endpoints.api_keys. */
export interface OrgApiKey {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

/** Only present in the response to POST — the plaintext key is never
 * stored and never shown again after this. */
export interface OrgApiKeyCreated extends OrgApiKey {
  api_key: string;
}

const READ_ONLY_MESSAGE = "Las API keys de organización no están disponibles en el sandbox.";

export async function fetchOrgApiKeys(): Promise<FetchResult<OrgApiKey[]>> {
  if (isDemoMode()) return { data: [], live: false };
  try {
    const data = await apiFetch<OrgApiKey[]>("/api/v1/organizations/api-keys", { cache: "no-store" });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function createOrgApiKey(name: string): Promise<OrgApiKeyCreated> {
  if (isDemoMode()) throw new Error(READ_ONLY_MESSAGE);
  return apiFetch<OrgApiKeyCreated>("/api/v1/organizations/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function revokeOrgApiKey(id: string): Promise<void> {
  if (isDemoMode()) throw new Error(READ_ONLY_MESSAGE);
  await apiFetch<void>(`/api/v1/organizations/api-keys/${id}`, { method: "DELETE" });
}
