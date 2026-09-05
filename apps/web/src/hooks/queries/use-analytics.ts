"use client";

import { useQuery } from "@tanstack/react-query";

import { getWarmIntroSummary, runRevenueSimulation } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/** "Introducciones cálidas" — how many of the org's current hot accounts
 *  have a warm path in, across the CEO's network (see network.py's
 *  `get_warm_intro_summary` / demo/overview.ts's `demoWarmIntroSummary`). */
export function useWarmIntroSummary() {
  return useQuery({
    queryKey: queryKeys.network.warmIntroSummary(),
    queryFn: () => getWarmIntroSummary(),
    staleTime: 5 * 60_000,
  });
}

/** "Simulador rápido" — the same RevenueSimulator the rest of the app has
 *  never actually surfaced (see analytics.py): real closed-deal win-rate
 *  data projected under more prospecting. `funding_round` is the one
 *  default every visitor's pipeline is most likely to have real closed
 *  deals for — a card with no controls needs one sensible default, not a
 *  form to fill in first. */
export function useQuickScenario(signalType = "funding_round", increaseFactor = 2) {
  return useQuery({
    queryKey: queryKeys.analytics.quickScenario(signalType, increaseFactor),
    queryFn: () => runRevenueSimulation({ signal_type: signalType, increase_factor: increaseFactor }),
    staleTime: 5 * 60_000,
  });
}
