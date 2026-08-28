/**
 * Local-only data store backing `/probar` — see `lib/demo/mode.ts` for why
 * this exists. Everything here lives in the visitor's own browser
 * (`localStorage`) and is seeded from `lib/sample-data`'s existing,
 * realistic example dataset. Nothing here ever calls the real API.
 */
import type { EmployeeRange } from "@/lib/api/organizations";
import type { CrmStage, OpportunityUpdateIn } from "@/lib/api/opportunities";
import { buildDemoCompanySet } from "@/lib/demo/templates";
import { sampleBattlecards, sampleOpportunities, sampleSignals } from "@/lib/sample-data";
import type {
  ArtifactBundle,
  Battlecard,
  Company,
  Lead,
  Opportunity,
  OpportunityStatus,
  OutcomeIn,
  Signal,
} from "@/types/domain";
import type { OutcomeWithPrediction } from "@/types/extended";

const OPPORTUNITIES_KEY = "bee_demo_opportunities_v1";
const SIGNALS_KEY = "bee_demo_signals_v1";
// Battlecards/artifacts for companies added via "Simula tu empresa" —
// the 2 seeded example opportunities keep using the static samples in
// lib/sample-data (checked first, see lib/api/opportunities.ts), this only
// holds ones generated locally.
const BATTLECARDS_KEY = "bee_demo_battlecards_v1";
const ARTIFACTS_KEY = "bee_demo_artifacts_v1";

function loadJSON<T>(key: string, seed: T): T {
  if (typeof window === "undefined") return structuredClone(seed);
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // Corrupted JSON or storage unavailable (private browsing, quota) —
    // reseed rather than crash the demo.
  }
  const seeded = structuredClone(seed);
  saveJSON(key, seeded);
  return seeded;
}

function saveJSON<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — the demo just won't persist across
    // reloads for this visitor. Not worth surfacing as an error.
  }
}

const load = () => loadJSON<Opportunity[]>(OPPORTUNITIES_KEY, sampleOpportunities);
const save = (list: Opportunity[]) => saveJSON(OPPORTUNITIES_KEY, list);

export function demoFetchOpportunities(status?: OpportunityStatus): Opportunity[] {
  const list = load();
  return status ? list.filter((o) => o.status === status) : list;
}

function findOrThrow(list: Opportunity[], id: string): number {
  const idx = list.findIndex((o) => o.id === id);
  if (idx === -1) {
    throw new Error(
      `Demo opportunity ${id} not found — it only exists in this browser's local demo data.`,
    );
  }
  return idx;
}

export function demoMoveOpportunityStage(id: string, stage: CrmStage): Opportunity {
  const list = load();
  const idx = findOrThrow(list, id);
  list[idx] = { ...list[idx], status: stage, updated_at: new Date().toISOString() };
  save(list);
  return list[idx];
}

export function demoUpdateOpportunity(id: string, patch: OpportunityUpdateIn): Opportunity {
  const list = load();
  const idx = findOrThrow(list, id);
  const current = list[idx];
  list[idx] = {
    ...current,
    amount: patch.amount !== undefined ? patch.amount : current.amount,
    expected_close_date:
      patch.expected_close_date !== undefined
        ? patch.expected_close_date
        : current.expected_close_date,
    qualification: patch.qualification ?? current.qualification,
    updated_at: new Date().toISOString(),
  };
  save(list);
  return list[idx];
}

/** Mirrors what the real `POST .../outcome` returns, honestly: no resource
 * prediction or dispatched workflow tasks actually ran, so those stay
 * null/zero rather than fabricating numbers — same policy the real backend
 * follows when a subsystem is off. */
export function demoRecordOutcome(id: string, body: OutcomeIn): OutcomeWithPrediction {
  const list = load();
  const idx = findOrThrow(list, id);
  const closedAt = new Date().toISOString();
  list[idx] = {
    ...list[idx],
    status: body.outcome,
    loss_reason: body.outcome === "lost" ? (body.loss_reason ?? null) : null,
    competitor: body.competitor ?? null,
    closed_at: closedAt,
    updated_at: closedAt,
  };
  save(list);
  return {
    opportunity_id: id,
    outcome: body.outcome,
    loss_reason: list[idx].loss_reason,
    competitor: list[idx].competitor,
    closed_at: closedAt,
    message: "Recorded in this browser's local demo data — not sent anywhere.",
    already_recorded: false,
    resource_prediction: null,
    workflow_tasks_dispatched: 0,
  };
}

// ── Signals ──────────────────────────────────────────────────────────────

export function demoFetchSignals(limit = 50): Signal[] {
  const list = loadJSON<Signal[]>(SIGNALS_KEY, sampleSignals);
  return list.slice(0, limit);
}

// ── Battlecards / artifacts for locally-generated companies ────────────────

export function demoFindBattlecard(opportunityId: string): Battlecard | undefined {
  return loadJSON<Battlecard[]>(BATTLECARDS_KEY, []).find((b) => b.opportunity_id === opportunityId);
}

export function demoFindArtifacts(opportunityId: string): ArtifactBundle | undefined {
  return loadJSON<ArtifactBundle[]>(ARTIFACTS_KEY, []).find((a) => a.opportunity_id === opportunityId);
}

/** "Simula tu empresa" — the only way new data enters the demo. Builds a
 * full Signal → Opportunity → Battlecard → Artifacts set (see
 * lib/demo/templates.ts for why it's an honest self-referential signal, not
 * a fabricated event) and appends it to every relevant local list. */
export function demoAddCompany(companyName: string, employeeRange: EmployeeRange): Opportunity {
  const set = buildDemoCompanySet(companyName, employeeRange);

  const opportunities = load();
  opportunities.unshift(set.opportunity);
  save(opportunities);

  const signals = loadJSON<Signal[]>(SIGNALS_KEY, sampleSignals);
  signals.unshift(set.signal);
  saveJSON(SIGNALS_KEY, signals);

  const battlecards = loadJSON<Battlecard[]>(BATTLECARDS_KEY, []);
  battlecards.push(set.battlecard);
  saveJSON(BATTLECARDS_KEY, battlecards);

  const artifacts = loadJSON<ArtifactBundle[]>(ARTIFACTS_KEY, []);
  artifacts.push(set.artifacts);
  saveJSON(ARTIFACTS_KEY, artifacts);

  return set.opportunity;
}

/** Wipes this visitor's local edits and restores the original seed data. */
export function resetDemoData(): void {
  save(structuredClone(sampleOpportunities));
  saveJSON(SIGNALS_KEY, structuredClone(sampleSignals));
  saveJSON(BATTLECARDS_KEY, []);
  saveJSON(ARTIFACTS_KEY, []);
}

// ── Companies / Leads (derived, not their own store) ────────────────────────
//
// There's no separate "companies" or "leads" local list — a Company/Lead in
// this demo is just whatever a Battlecard's `company`/`lead` sub-object
// says, deduped by name, across the 2 seeded battlecards plus any added via
// "Simula tu empresa". This keeps them always in sync with the pipeline
// (add a company there, it shows up here too) without a second source of
// truth to drift out of. Read-only: there's no demoCreateCompany/
// demoCreateLead — Empresas/Leads only display what the pipeline already
// produced, matching "solo mover o visualizar, no modificar" for the
// sections that aren't the pipeline itself.

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || "demo";
}

function allBattlecards(): Battlecard[] {
  return [...sampleBattlecards, ...loadJSON<Battlecard[]>(BATTLECARDS_KEY, [])];
}

export function demoFetchCompanies(): Company[] {
  const seen = new Map<string, Company>();
  for (const card of allBattlecards()) {
    const name = card.company.name;
    if (!name || seen.has(name)) continue;
    seen.set(name, {
      id: `demo-company-${slugify(name)}`,
      name,
      domain: card.company.domain,
      industry: card.company.industry,
      size: null,
      country: card.company.country,
      website: card.company.domain ? `https://${card.company.domain}` : null,
      description: null,
      attributes: {},
      created_at: card.created_at,
    });
  }
  return [...seen.values()];
}

export function demoFetchLeads(): Lead[] {
  const companyIdByName = new Map(demoFetchCompanies().map((c) => [c.name, c.id]));
  const seen = new Map<string, Lead>();
  for (const card of allBattlecards()) {
    const name = card.lead.full_name;
    if (!name || seen.has(name)) continue;
    const companyName = card.company.name;
    seen.set(name, {
      id: `demo-lead-${slugify(name)}`,
      company_id: companyName ? (companyIdByName.get(companyName) ?? null) : null,
      organization_id: null,
      assigned_to_user_id: null,
      full_name: name,
      email: card.lead.email,
      title: card.lead.title,
      seniority: card.lead.seniority,
      linkedin_url: card.lead.linkedin_url,
      phone: null,
      status: "new",
      score: card.score,
      attributes: {},
      created_at: card.created_at,
      data_freshness_score: 1,
      validation_flags: [],
      last_validated_at: card.created_at,
      stale_risk: false,
    });
  }
  return [...seen.values()];
}
