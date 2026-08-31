/**
 * Local-only data store backing `/probar` — see `lib/demo/mode.ts` for why
 * this exists. Everything here lives in the visitor's own browser
 * (`localStorage`) and is seeded from `lib/sample-data`'s existing,
 * realistic example dataset. Nothing here ever calls the real API.
 */
import type { EmployeeRange } from "@/lib/api/organizations";
import type { CrmStage, OpportunityUpdateIn } from "@/lib/api/opportunities";
import type {
  DynamicSequenceOut,
  SequenceCreateIn,
} from "@/lib/api/sequences";
import type {
  MessageTemplate,
  MessageTemplateCreateIn,
  MessageTemplateUpdateIn,
} from "@/lib/api/templates";
import { buildDemoCompanySet, buildManualOpportunitySet, type ManualOpportunityInput } from "@/lib/demo/templates";
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

/** Bump this whenever `sample-data.ts`/`seed-history.ts` changes in a way
 * existing visitors should see. Without this, a browser that already
 * seeded its localStorage on an earlier visit keeps that OLD snapshot
 * forever — later improvements to the seed data (e.g. richer history)
 * silently never reach a returning visitor, since `loadJSON` below only
 * seeds when a key is completely absent. `"1"` is the original 4-signal/
 * 2-opportunity seed (unversioned, so any stored data with no version tag
 * counts as "1"); `"2"` is the enriched 18-account history added later;
 * `"3"` staggers the 6 open seeds' `expected_close_date` across the
 * 6-month Pronóstico window and adds ambient signals so the 14-day
 * Volumen de señales chart isn't mostly empty bars. */
const SEED_VERSION = "3";
const SEED_VERSION_KEY = "bee_demo_seed_version_v1";

/** Reseeds the base opportunities/signals when the visitor's stored
 * snapshot predates the current `SEED_VERSION` — including a first-ever
 * visit, which has no stored version at all. Discards anything added
 * locally via "Simula tu empresa" under the old version, same as an
 * explicit `resetDemoData()`; acceptable for a sandbox that's explicitly
 * "nunca se guarda en nuestra base de datos". Safe to call on every read:
 * one string comparison when already current. */
function ensureCurrentSeed(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(SEED_VERSION_KEY) === SEED_VERSION) return;
    resetDemoData();
    window.localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
  } catch {
    // Storage unavailable — nothing to migrate, demo just won't persist.
  }
}

function loadJSON<T>(key: string, seed: T): T {
  ensureCurrentSeed();
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

/** "+ Nueva oportunidad" (CRM board / company detail) — the local
 * counterpart to `POST /opportunities`. Same append pattern as
 * `demoAddCompany`, just backed by `buildManualOpportunitySet` (a real
 * prospect the rep names, not the self-referential "Simula tu empresa"
 * signal) — see that function's docstring for why this is still within the
 * sandbox's honesty policy. */
export function demoCreateOpportunity(input: ManualOpportunityInput): Opportunity {
  const set = buildManualOpportunitySet(input);

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

/** Every battlecard this visitor's demo knows about — the 2+historical seeded
 * ones plus any added via "Simula tu empresa". Used by the cycle-prediction
 * JS port (lib/cycle-prediction.ts) to look up a closed deal's industry,
 * mirroring how the real backend joins Opportunity → Company. */
export function demoFetchAllBattlecards(): Battlecard[] {
  return allBattlecards();
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

/** Single-company lookup for the company detail page — same derived,
 * name-deduped list as `demoFetchCompanies`, just filtered to one id. */
export function demoFetchCompany(companyId: string): Company | undefined {
  return demoFetchCompanies().find((c) => c.id === companyId);
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

// ── Message templates (Biblioteca de mensajes) ──────────────────────────────

const TEMPLATES_KEY = "bee_demo_templates_v1";

const SEED_TEMPLATES: MessageTemplate[] = [
  {
    id: "demo-template-funding",
    name: "Apertura post-financiamiento",
    channel: "email",
    subject: "Felicidades por la ronda — una pregunta rápida",
    body:
      "Hola {{first_name}},\n\nVi que {{company_name}} acaba de cerrar una ronda — felicidades. " +
      "¿Vale la pena una llamada de 15 minutos para platicar cómo están pensando escalar el equipo de ventas?\n\nSaludos,",
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-template-hiring-linkedin",
    name: "Seguimiento LinkedIn — nueva contratación",
    channel: "linkedin",
    subject: null,
    body:
      "Hola {{first_name}}, vi que te uniste a {{company_name}} — felicidades por el nuevo rol. " +
      "Me encantaría compartir cómo ayudamos a equipos en etapas similares a acortar el ciclo de ventas. " +
      "¿Tienes 15 minutos esta semana?",
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-template-reactivation",
    name: "Reactivación — sin respuesta",
    channel: "email",
    subject: "¿Seguimos platicando?",
    body:
      "Hola {{first_name}},\n\nNo quiero ser inoportuno — ¿este sigue siendo un buen momento para platicar " +
      "sobre {{company_name}}? Si no, dime y no te vuelvo a escribir.\n\nSaludos,",
    created_at: new Date().toISOString(),
  },
];

const loadTemplates = () => loadJSON<MessageTemplate[]>(TEMPLATES_KEY, SEED_TEMPLATES);
const saveTemplates = (list: MessageTemplate[]) => saveJSON(TEMPLATES_KEY, list);

export function demoFetchTemplates(limit = 100): MessageTemplate[] {
  return loadTemplates().slice(0, limit);
}

export function demoCreateTemplate(body: MessageTemplateCreateIn): MessageTemplate {
  const list = loadTemplates();
  const created: MessageTemplate = {
    id: `demo-template-${Date.now()}`,
    name: body.name,
    channel: body.channel,
    subject: body.subject ?? null,
    body: body.body,
    created_at: new Date().toISOString(),
  };
  list.unshift(created);
  saveTemplates(list);
  return created;
}

function findTemplateOrThrow(list: MessageTemplate[], id: string): number {
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) {
    throw new Error(`Demo template ${id} not found — it only exists in this browser's local demo data.`);
  }
  return idx;
}

export function demoUpdateTemplate(id: string, patch: MessageTemplateUpdateIn): MessageTemplate {
  const list = loadTemplates();
  const idx = findTemplateOrThrow(list, id);
  const current = list[idx];
  list[idx] = {
    ...current,
    name: patch.name ?? current.name,
    channel: patch.channel ?? current.channel,
    subject: patch.subject !== undefined ? patch.subject : current.subject,
    body: patch.body ?? current.body,
  };
  saveTemplates(list);
  return list[idx];
}

export function demoDeleteTemplate(id: string): void {
  saveTemplates(loadTemplates().filter((t) => t.id !== id));
}

// ── Sequences (Automatizaciones) ────────────────────────────────────────────
//
// Building/previewing a flow (StepComposer, FlowCanvas) is already pure
// client-side state in AutomationBuilder — only the list/get/save calls
// need a demo backing. "Disparar secuencia" (CriticalAccountsDigest, on
// Resumen) and "Enviar a secuencia" (Leads) both resolve locally too, same
// honesty as demoRecordOutcome: recorded in this browser, nothing actually
// sent — DynamicSequenceEngine's approval-gated execution isn't real
// infrastructure state the way Resiliencia/Control's queues are, it's just
// a record of "this got queued," which a local store can represent exactly.

const SEQUENCES_KEY = "bee_demo_sequences_v1";

const SEED_SEQUENCES: DynamicSequenceOut[] = [
  {
    id: "demo-sequence-funding",
    name: "Financiamiento → primer contacto",
    description: "Cadencia de 3 pasos para señales de ronda de financiamiento recién detectada.",
    signal_type: "funding_round",
    industry: null,
    seniority: null,
    entry_step_id: "s1",
    steps: [
      {
        id: "s1",
        name: "Enviar email",
        action: "send_email",
        channel: "email",
        transitions: [{ condition: "no_response", next_step_id: "s2", delay_days: 3 }],
        max_wait_days: 7,
        notes: null,
      },
      {
        id: "s2",
        name: "Solicitud de conexión",
        action: "linkedin_connect",
        channel: "linkedin",
        transitions: [{ condition: "no_response", next_step_id: "s3", delay_days: 4 }],
        max_wait_days: 7,
        notes: null,
      },
      {
        id: "s3",
        name: "Seguimiento",
        action: "follow_up",
        channel: "email",
        transitions: [{ condition: "no_response", next_step_id: null, delay_days: 5 }],
        max_wait_days: 7,
        notes: null,
      },
    ],
    max_days: 30,
    status: "active",
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const loadSequences = () => loadJSON<DynamicSequenceOut[]>(SEQUENCES_KEY, SEED_SEQUENCES);
const saveSequences = (list: DynamicSequenceOut[]) => saveJSON(SEQUENCES_KEY, list);

export function demoFetchSequences(limit = 50): DynamicSequenceOut[] {
  return loadSequences().slice(0, limit);
}

export function demoFetchSequence(id: string): DynamicSequenceOut {
  const found = loadSequences().find((s) => s.id === id);
  if (!found) {
    throw new Error(`Demo sequence ${id} not found — it only exists in this browser's local demo data.`);
  }
  return found;
}

export function demoCreateSequence(body: SequenceCreateIn): DynamicSequenceOut {
  const list = loadSequences();
  const now = new Date().toISOString();
  const created: DynamicSequenceOut = {
    id: `demo-sequence-${Date.now()}`,
    name: body.name,
    description: body.description ?? null,
    signal_type: body.signal_type ?? null,
    industry: body.industry ?? null,
    seniority: body.seniority ?? null,
    entry_step_id: body.entry_step_id,
    steps: body.steps,
    max_days: body.max_days,
    status: "active",
    version: 1,
    created_at: now,
    updated_at: now,
  };
  list.unshift(created);
  saveSequences(list);
  return created;
}

/** "Disparar secuencia"/"Enviar a secuencia" in demo mode — validates the
 * sequence exists locally and reports success without dispatching anything
 * real, matching demoRecordOutcome's honesty. */
export function demoStartSequenceExecution(sequenceId: string): { id: string; status: string } {
  demoFetchSequence(sequenceId); // throws if the sequence isn't real
  return { id: `demo-execution-${Date.now()}`, status: "active" };
}
