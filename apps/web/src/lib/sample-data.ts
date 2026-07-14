import type { Opportunity, Signal } from "@/lib/types";

/**
 * Illustrative data used when the backend API is not reachable (e.g. static
 * previews / first run before `docker compose up`). It keeps the dashboard fully
 * renderable and demonstrates the shape of real Signal Engine output.
 */
export const sampleSignals: Signal[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    signal_type: "funding_round",
    source: "webhook",
    title: "Northwind Labs raised a $32M Series B",
    description: "Led by Sequoia to accelerate go-to-market in EMEA.",
    score: 92,
    confidence: 0.86,
    detected_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    company_id: "c1",
    lead_id: "l1",
    analysis: {
      tags: ["funding", "series b"],
      analyzers: ["funding", "generic_fallback"],
      primary_analyzer: "funding",
    },
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    signal_type: "leadership_change",
    source: "webhook",
    title: "Acme Corp hired a new VP of Revenue Operations",
    description: "Ex-Datadog leader joins to build the RevOps function.",
    score: 74,
    confidence: 0.71,
    detected_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    company_id: "c2",
    lead_id: "l2",
    analysis: {
      tags: ["hiring", "vp of"],
      analyzers: ["hiring"],
      primary_analyzer: "hiring",
    },
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    signal_type: "tech_adoption",
    source: "crawler",
    title: "Globex migrated its data stack to Snowflake",
    description: "Detected new integration references on their engineering blog.",
    score: 58,
    confidence: 0.62,
    detected_at: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
    company_id: "c3",
    lead_id: null,
    analysis: {
      tags: ["tech", "migrated to"],
      analyzers: ["tech_adoption"],
      primary_analyzer: "tech_adoption",
    },
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    signal_type: "expansion",
    source: "enrichment",
    title: "Initech announced a new office in Berlin",
    description: "European expansion signalling new regional budgets.",
    score: 44,
    confidence: 0.55,
    detected_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    company_id: "c4",
    lead_id: null,
    analysis: {
      tags: ["expansion"],
      analyzers: ["generic_fallback"],
      primary_analyzer: "generic_fallback",
    },
  },
];

export const sampleOpportunities: Opportunity[] = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "Opportunity: Northwind Labs raised a $32M Series B",
    status: "prioritized",
    score: 92,
    strategy: {
      playbook: "post_funding_outreach",
      next_best_action: "reach_out",
      channel: "email",
      rationale:
        "Northwind Labs recently secured funding — a prime window to engage while budgets are being allocated.",
    },
    signal_id: "11111111-1111-1111-1111-111111111111",
    lead_id: "l1",
    company_id: "c1",
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    title: "Opportunity: Acme Corp hired a new VP of Revenue Operations",
    status: "detected",
    score: 74,
    strategy: {
      playbook: "hiring_growth_outreach",
      next_best_action: "reach_out",
      channel: "linkedin",
      rationale:
        "A new RevOps leader is actively shaping tooling decisions in their first 90 days.",
    },
    signal_id: "22222222-2222-2222-2222-222222222222",
    lead_id: "l2",
    company_id: "c2",
  },
];
