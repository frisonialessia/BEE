import type { Battlecard, Opportunity, Signal } from "@/lib/types";

/**
 * Illustrative data used when the backend API is not reachable (e.g. static
 * previews / first run before `docker compose up`). It keeps the dashboard fully
 * renderable and demonstrates the shape of real Signal Engine + Battlecard output.
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
    status: "ready_to_action",
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
    status: "ready_to_action",
    score: 74,
    strategy: {
      playbook: "leadership_change_outreach",
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

// Sample battlecards (one per opportunity) demonstrating the full CEO brief format.
export const sampleBattlecards: Battlecard[] = [
  {
    opportunity_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "Northwind Labs raised a $32M Series B",
    status: "ready_to_action",
    score: 92,
    ready_to_action: true,
    company: {
      name: "Northwind Labs",
      domain: "northwindlabs.com",
      industry: "B2B SaaS",
      country: "USA",
    },
    lead: {
      full_name: "Alice Mercer",
      title: "VP of Sales",
      email: "alice@northwindlabs.com",
      seniority: "vp",
      linkedin_url: "https://linkedin.com/in/alicemercer",
    },
    signal: {
      id: "11111111-1111-1111-1111-111111111111",
      signal_type: "funding_round",
      title: "Northwind Labs raised a $32M Series B",
      description: "Led by Sequoia to accelerate go-to-market in EMEA.",
      score: 92,
      detected_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
      tags: ["funding", "series b"],
    },
    strategy: {
      pain_point:
        "Northwind Labs just closed a $32M Series B and now faces the classic scale-up paradox: they have capital to deploy but their existing processes, tools, and team aren't ready for the next growth phase. Every week of delay is a competitive disadvantage.",
      closing_argument:
        "Congrats on the Series B — companies at this stage typically need to 2-3× their go-to-market capacity in the next 90 days. We've helped Northwind-sized teams do exactly that without the usual ramp-time penalty. Would a 20-minute call this week make sense?",
      timing_window: {
        urgency: "immediate",
        reason:
          "Budget allocation decisions are made in the first 60 days post-Series B close. Vendors engaged early are 3× more likely to be selected.",
        expires_at: "60 days post-funding close",
      },
      playbook: "post_funding_outreach",
      next_best_action: "reach_out",
      channel: "email",
      rationale: "Signal score 92/100 — Northwind Labs raised Series B ($32M). Lead: Alice Mercer.",
      generator: "rule_based",
      generator_version: "1.0.0",
      generated_at: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    opportunity_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    title: "Acme Corp hired a new VP of Revenue Operations",
    status: "ready_to_action",
    score: 74,
    ready_to_action: true,
    company: {
      name: "Acme Corp",
      domain: "acme.com",
      industry: "Enterprise Software",
      country: "USA",
    },
    lead: {
      full_name: "Robert Chen",
      title: "VP of Revenue Operations",
      email: "rchen@acme.com",
      seniority: "vp",
      linkedin_url: null,
    },
    signal: {
      id: "22222222-2222-2222-2222-222222222222",
      signal_type: "leadership_change",
      title: "Acme Corp hired a new VP of Revenue Operations",
      description: "Ex-Datadog leader joins to build the RevOps function.",
      score: 74,
      detected_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      tags: ["hiring", "vp of"],
    },
    strategy: {
      pain_point:
        "Acme Corp just brought in a new VP of Revenue Operations. New executives typically spend their first 90 days auditing current vendors, processes, and tooling — and making replacement decisions. The ones they meet early shape their mental model of 'what good looks like'.",
      closing_argument:
        "I noticed Acme Corp recently welcomed a new VP of Revenue Operations. Most RevOps leaders in that position do a full tech audit in their first quarter — we've helped several of them build a modern intelligence stack from scratch. Would it be worth a call to share what's working for others in your space?",
      timing_window: {
        urgency: "this_week",
        reason:
          "The first 30-60 days of a new leadership role are the 'blank slate' phase — no vendor loyalty, high receptivity, and active tool evaluation.",
        expires_at: "90 days post-hire",
      },
      playbook: "leadership_change_outreach",
      next_best_action: "reach_out",
      channel: "linkedin",
      rationale: "Signal score 74/100 — Acme Corp / VP of Revenue Operations.",
      generator: "rule_based",
      generator_version: "1.0.0",
      generated_at: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];
