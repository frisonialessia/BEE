import { apiFetch, buildApiHeaders, getApiBaseUrl } from "./client";

/**
 * BEE API Client — centralized entry point for all backend requests.
 *
 * Automatically attaches `X-API-Key` from `NEXT_PUBLIC_BEE_API_KEY` on every call.
 */
export {
  apiFetch,
  buildApiHeaders,
  getApiBaseUrl,
  type ApiFetchOptions,
} from "./client";

export { fetchSignals } from "./signals";
export {
  fetchArtifacts,
  fetchBattlecard,
  fetchBattlecards,
  fetchOpportunities,
  recordOutcome,
} from "./opportunities";
export { fetchIngestionStatus, fetchSignalStream, fetchSystemHealth } from "./control";

export const beeApi = {
  fetch: apiFetch,
  getBaseUrl: getApiBaseUrl,
  headers: buildApiHeaders,
} as const;
