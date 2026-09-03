/**
 * Market-scan senses — `GET /market-sources`. Which sources feed the
 * proactive scan and whether each is live. Keyless ones (GDELT press,
 * Greenhouse/Lever hiring) are always on; Google news needs a key.
 */

import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";

export interface MarketSource {
  name: string;
  configured: boolean;
  requires_credentials: boolean;
  rate_limit_per_hour: number;
}

export interface MarketSources {
  scan_enabled: boolean;
  interval_hours: number;
  sources: MarketSource[];
}

const DEMO_SOURCES: MarketSources = {
  scan_enabled: true,
  interval_hours: 24,
  sources: [
    { name: "gdelt", configured: true, requires_credentials: false, rate_limit_per_hour: 200 },
    { name: "hiring", configured: true, requires_credentials: false, rate_limit_per_hour: 100 },
    { name: "google_search", configured: false, requires_credentials: true, rate_limit_per_hour: 100 },
  ],
};

export async function fetchMarketSources(): Promise<MarketSources> {
  if (isDemoMode()) return DEMO_SOURCES;
  return apiFetch<MarketSources>("/api/v1/market-sources", { cache: "no-store" });
}
