import type { ArtifactBundle, Battlecard, Opportunity, Signal } from "@/lib/types";
import type { HotLeadScore } from "@/types/extended";

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
      pain_point: "Post-funding teams must scale outbound before the 90-day hiring plan stalls.",
      closing_argument:
        "Congratulations on the Series B — we help funded teams ramp pipeline 2× faster in the first quarter.",
      timing_window: { urgency: "immediate" as const, reason: "Budget allocation window", expires_at: "90 days" },
      playbook: "post_funding_outreach",
      next_best_action: "reach_out",
      channel: "email",
      generator: "rule_based",
      generated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      rationale:
        "Northwind Labs recently secured funding — a prime window to engage while budgets are being allocated.",
    },
    signal_id: "11111111-1111-1111-1111-111111111111",
    lead_id: "l1",
    company_id: "c1",
    assigned_to_user_id: null,
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    title: "Opportunity: Acme Corp hired a new VP of Revenue Operations",
    status: "ready_to_action",
    score: 74,
    strategy: {
      pain_point: "New RevOps leader is evaluating the entire sales stack in their first 90 days.",
      closing_argument:
        "Saw you joined as VP RevOps — teams at your stage typically rebuild pipeline infrastructure in Q1.",
      timing_window: { urgency: "this_week" as const, reason: "New hire evaluation window", expires_at: null },
      playbook: "leadership_change_outreach",
      next_best_action: "reach_out",
      channel: "linkedin",
      generator: "rule_based",
      generated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      rationale:
        "A new RevOps leader is actively shaping tooling decisions in their first 90 days.",
    },
    signal_id: "22222222-2222-2222-2222-222222222222",
    lead_id: "l2",
    company_id: "c2",
    assigned_to_user_id: null,
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
    hot_lead: true,
    manual_review_required: false,
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
      confidence_score: 0.88,
      manual_review_required: false,
      variant_id: null,
      variant_arm: null,
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
    hot_lead: false,
    manual_review_required: false,
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
      confidence_score: 0.82,
      manual_review_required: false,
      variant_id: null,
      variant_arm: null,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const sampleArtifacts: ArtifactBundle[] = [
  {
    opportunity_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    generated_at: new Date().toISOString(),
    generator: "rule_based_artifacts",
    email_draft: {
      artifact_type: "email_draft",
      subject: "Quick question re: congrats on the funding",
      body: `Hi Alice,

Congrats on the Series B — companies at this stage typically need to 2-3× their go-to-market capacity in the next 90 days. We've helped Northwind-sized teams do exactly that without the usual ramp-time penalty. Would a 20-minute call this week make sense?

Best,
[Your name]`,
      ps_line: "P.S. The timing window here is 60 days post-funding close — worth a quick chat before then.",
      recommended_send_time: "Tuesday–Thursday, 8–10 AM recipient local time",
      estimated_read_time_seconds: 30,
    },
    meeting_structure: {
      artifact_type: "meeting_structure",
      meeting_title: "BEE × Northwind Labs — Discovery Call",
      total_duration_minutes: 20,
      objective: "Qualify Northwind Labs as a fit and establish a clear next step before the 60 days post-funding window closes.",
      agenda_items: [
        { duration_minutes: 3, title: "Rapport & context-setting", notes: "Reference their recent Series B news." },
        { duration_minutes: 5, title: "Discovery: understand their current pain", notes: "Probe on: scale-up paradox and capital deployment challenges." },
        { duration_minutes: 7, title: "Our value prop (signal-specific)", notes: "Tie directly to what you heard in discovery." },
        { duration_minutes: 3, title: "Next steps & timeline", notes: "Aim for a clear commitment before day 60." },
        { duration_minutes: 2, title: "Q&A and close", notes: null },
      ],
      pre_meeting_prep: [
        "Review Northwind Labs' recent Series B announcement.",
        "Research VP of Sales background and LinkedIn activity.",
        "Prepare 2–3 case studies for companies in a similar post-funding stage.",
        "Know BEE's answer to: 'Why now, specifically for Northwind Labs?'",
      ],
      success_criteria: "VP of Sales shares their top challenge and agrees to a follow-up meeting or trial within the week.",
    },
    next_steps: {
      artifact_type: "next_steps",
      horizon: "Next 7 days",
      actions: [
        { action: "Send the drafted email to Northwind Labs via email", owner: "rep", timing: "within 24h", priority: "high" },
        { action: "Connect on LinkedIn and engage with recent post (warm the lead)", owner: "rep", timing: "same day as email", priority: "medium" },
        { action: "Research Northwind Labs deeply — recent news, tech stack, team size", owner: "rep", timing: "before sending email", priority: "high" },
        { action: "If no reply in 3 days: follow up with a relevant case study", owner: "rep", timing: "3 days after initial outreach", priority: "medium" },
        { action: "Log all touchpoints in CRM with outcome tags for BEE's learning loop", owner: "rep", timing: "after each interaction", priority: "medium" },
        { action: "Hard deadline: must be in conversation before 60 days post-funding close", owner: "rep", timing: "60 days post-funding close", priority: "high" },
      ],
      key_risk: "Competitor reaches out first. Timing window: Budget allocation decisions are made in the first 60 days post-Series B close.",
      success_milestone: "First meeting booked with a decision-maker at Northwind Labs.",
    },
    context_snapshot: {
      company: "Northwind Labs",
      lead: "Alice Mercer",
      signal_type: "funding_round",
      playbook: "post_funding_outreach",
      channel: "email",
    },
  },
];

export const sampleHotLeads: HotLeadScore[] = [
  {
    id: "h1",
    company_domain: "northwindlabs.com",
    company_name: "Northwind Labs",
    lead_id: "l1",
    research_intensity_score: 92,
    buying_stage: "ready_to_buy",
    signal_count: 8,
    signal_types_seen: ["pricing_view", "demo_watch"],
    top_intent_keywords: ["sales automation", "pipeline"],
    last_signal_at: new Date(Date.now() - 3600000).toISOString(),
    is_hot: true,
    hot_since: new Date(Date.now() - 86400000).toISOString(),
    alerted: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "h2",
    company_domain: "acme.com",
    company_name: "Acme Corp",
    lead_id: "l2",
    research_intensity_score: 74,
    buying_stage: "decision",
    signal_count: 5,
    signal_types_seen: ["competitor_compare", "review_visit"],
    top_intent_keywords: ["revops", "crm integration"],
    last_signal_at: new Date(Date.now() - 7200000).toISOString(),
    is_hot: true,
    hot_since: null,
    alerted: false,
    created_at: new Date().toISOString(),
  },
  ...Array.from({ length: 38 }, (_, i) => ({
    id: `h-gen-${i}`,
    company_domain: `company-${i}.io`,
    company_name: `Company ${i}`,
    lead_id: null,
    research_intensity_score: 20 + ((i * 17) % 75),
    buying_stage: (["awareness", "consideration", "decision", "ready_to_buy"] as const)[i % 4],
    signal_count: 1 + (i % 6),
    signal_types_seen: ["search", "pricing_view"].slice(0, 1 + (i % 2)),
    top_intent_keywords: ["intent", "research"],
    last_signal_at: new Date(Date.now() - i * 3600000).toISOString(),
    is_hot: i % 5 === 0,
    hot_since: i % 5 === 0 ? new Date().toISOString() : null,
    alerted: false,
    created_at: new Date().toISOString(),
  })),
];
