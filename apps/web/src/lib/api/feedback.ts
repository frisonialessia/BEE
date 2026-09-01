import { apiFetch } from "@/lib/api/client";
import { demoSuccessPatterns } from "@/lib/demo/store";
import { isDemoMode } from "@/lib/demo/mode";
import type { FetchResult } from "@/types/api";

export interface SuccessPattern {
  signal_type: string;
  playbook: string;
  channel: string;
  generator: string;
  win_rate: number;
  sample_size: number;
  avg_days_to_close: number | null;
  confidence: "low" | "medium" | "high";
}

/** El paso "aprender" del loop, hecho visible: patrones de éxito reales
 *  (win-rate por playbook/canal), ya filtrados en el backend por una muestra
 *  mínima — nunca un patrón inventado. `signalType` omitido trae los mejores
 *  patrones de la organización en cualquier tipo de señal. */
export async function fetchSuccessPatterns(
  signalType?: string,
): Promise<FetchResult<SuccessPattern[]>> {
  if (isDemoMode()) {
    // Same aggregation the real FeedbackLoopService runs (grouped win rate
    // over closed deals, min-sample floor, confidence bands) — see
    // demoSuccessPatterns' docstring — computed over the seed history
    // instead of a real StrategyOutcome table.
    return { data: demoSuccessPatterns(signalType), live: false };
  }
  try {
    const qs = signalType ? `?signal_type=${encodeURIComponent(signalType)}` : "";
    const data = await apiFetch<SuccessPattern[]>(`/api/v1/feedback/patterns${qs}`, {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}
