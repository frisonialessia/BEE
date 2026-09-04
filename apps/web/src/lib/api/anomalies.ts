import { apiFetch } from "@/lib/api/client";
import { demoFetchOpenAnomalies } from "@/lib/demo/store";
import { isDemoMode } from "@/lib/demo/mode";
import type { FetchResult } from "@/types/api";

export interface AnomalyAlert {
  id: string;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  status: string;
  segment_type: string;
  segment_value: string | null;
  rolling_rate: number;
  baseline_rate: number;
  deviation_pct: number;
  title: string;
  description: string;
  recommendation: string;
}

export async function fetchOpenAnomalies(): Promise<FetchResult<AnomalyAlert[]>> {
  if (isDemoMode()) return { data: demoFetchOpenAnomalies(), live: false };
  try {
    const data = await apiFetch<AnomalyAlert[]>("/api/v1/analytics/anomalies?status=open", {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}
