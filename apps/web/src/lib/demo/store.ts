/**
 * Local-only data store backing `/probar` — see `lib/demo/mode.ts` for why
 * this exists. Everything here lives in the visitor's own browser
 * (`localStorage`) and is seeded from `lib/sample-data`'s existing,
 * realistic example dataset. Nothing here ever calls the real API.
 */
import type { Locale } from "@/i18n/locales";
import type { EmployeeRange } from "@/lib/api/organizations";
import type { MeetingCreateIn, MeetingUpdateIn } from "@/lib/api/meetings";
import type { CrmStage, OpportunityUpdateIn } from "@/lib/api/opportunities";
import type { TeamOut, UserOut } from "@/types/auth";
import type { Meeting, MeetingClientContext } from "@/types/domain";
import type {
  DynamicSequenceOut,
  SequenceCreateIn,
} from "@/lib/api/sequences";
import type {
  MessageTemplate,
  MessageTemplateCreateIn,
  MessageTemplateUpdateIn,
} from "@/lib/api/templates";
import { getDemoLocale } from "@/lib/demo/locale";
import { buildDemoCompanySet, buildManualOpportunitySet, type ManualOpportunityInput } from "@/lib/demo/templates";
import { getSampleBattlecards, getSampleOpportunities, getSampleSignals } from "@/lib/sample-data";
import type {
  ArtifactBundle,
  Battlecard,
  Company,
  Lead,
  Opportunity,
  OpportunityStatus,
  OpportunityTask,
  OpportunityTaskCreateIn,
  OpportunityTaskUpdateIn,
  OutcomeIn,
  Signal,
} from "@/types/domain";
import type {
  AccountBrief,
  AccountResearchResult,
  AnomalyAlert as ExtendedAnomalyAlert,
  AnomalyCheckResult,
  AuditEntry,
  AuditSummary,
  BrandFragment,
  BrandVoicePreviewResult,
  CorrectionOut,
  DLQRetryResult,
  DLQSummary,
  FailedEvent,
  IntroPath,
  MarketInsight,
  NetworkConnection,
  NetworkQueryResult,
  NetworkStats,
  OutcomeWithPrediction,
  PendingAction,
  StyleProfileOut,
  VoiceProfile,
  VoiceProfileExtractResult,
} from "@/types/extended";

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
 * Volumen de señales chart isn't mostly empty bars; `"4"` adds the local
 * stores backing Control/Red/Voz de marca/Resiliencia (see the sections
 * below) — a returning visitor on an older snapshot never had those keys
 * seeded at all, so without this bump those 4 sections would load empty
 * instead of the intended full simulation; `"5"` adds 2 more lost seeds
 * (s19/s20) with distinct named competitors (Apollo.io, Clay) so Win/Loss's
 * `Competitors` box has as many rows as `Loss reasons` (both 5) instead of
 * visibly shorter, and reads as more than just competing CRMs; `"6"` stamps
 * `assigned_to_user_id` on every seeded opportunity with a demo rep (see
 * DEMO_USERS below) so the Leaderboard and Calendario have someone to show —
 * a returning visitor on an older snapshot has every opportunity's
 * `assigned_to_user_id` still `null`, which reads as "no one on the team
 * has ever won a deal" instead of the sandbox just never having stamped it. */
const SEED_VERSION = "6";
const SEED_VERSION_KEY = "bee_demo_seed_version_v1";

/** Which language the currently-stored seed was written in — separate from
 * `SEED_VERSION_KEY` because the two invalidate for different reasons: a
 * version bump means the seed *content* changed; a locale change means the
 * visitor switched languages (via the switcher in the header) and the base
 * seed sitting in `localStorage` from before that switch is now in the
 * wrong language. Only the base seed reseeds on a locale change — anything
 * the visitor added themselves via "Simula tu empresa"/"+ Nueva
 * oportunidad" is discarded exactly like any other reseed (see
 * `ensureCurrentSeed`'s docstring), which is the right call: there's no
 * way to translate a rep's own typed-in company name/description after
 * the fact, and the sandbox has never promised to preserve local edits
 * across a reseed anyway. */
const SEED_LOCALE_KEY = "bee_demo_seed_locale_v1";

/** Reseeds the base opportunities/signals when the visitor's stored
 * snapshot predates the current `SEED_VERSION`, or was seeded in a
 * different language than the visitor's current choice — including a
 * first-ever visit, which has no stored version or locale at all. Discards
 * anything added locally via "Simula tu empresa" under the old version,
 * same as an explicit `resetDemoData()`; acceptable for a sandbox that's
 * explicitly "nunca se guarda en nuestra base de datos". Safe to call on
 * every read: two string comparisons when already current. */
function ensureCurrentSeed(): void {
  if (typeof window === "undefined") return;
  try {
    const locale = getDemoLocale();
    const currentVersion = window.localStorage.getItem(SEED_VERSION_KEY);
    const currentLocale = window.localStorage.getItem(SEED_LOCALE_KEY);
    if (currentVersion === SEED_VERSION && currentLocale === locale) return;
    resetDemoData();
    window.localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
    window.localStorage.setItem(SEED_LOCALE_KEY, locale);
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

// ── Demo team (Leaderboard, Calendario attendees) ───────────────────────────
//
// fetchUsers()'s own long-standing comment says "no demo team to speak of —
// the sandbox has no login, so there's no 'assigned to' list" and returns
// an honest empty array. Explicitly overridden here — same precedent as
// Control/Red/Voz de marca/Resiliencia's own local stores (see
// PROBAR_LIVE_SECTIONS' docstring: "the BEE team later asked for a fully
// realistic simulation... explicitly overriding that default"). A
// leaderboard and a shared calendar are BOTH inherently multi-person
// features — showing either with zero teammates isn't a smaller honest
// version of the feature, it's not the feature at all. These ids are
// `demo-user-*`, never mistakable for a real account.
const DEMO_TEAMS: TeamOut[] = [
  { id: "demo-team-north", organization_id: "demo-org", parent_team_id: null, name: "Equipo Norte", description: null },
  { id: "demo-team-south", organization_id: "demo-org", parent_team_id: null, name: "Equipo Sur", description: null },
];

const DEMO_USERS_ES: UserOut[] = [
  { id: "demo-user-1", organization_id: "demo-org", team_id: "demo-team-north", email: "ana@demo.bee", full_name: "Ana García", role: "manager", is_active: true, avatar_url: null, phone: null, bio: null, timezone: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "demo-user-2", organization_id: "demo-org", team_id: "demo-team-north", email: "carlos@demo.bee", full_name: "Carlos Ruiz", role: "member", is_active: true, avatar_url: null, phone: null, bio: null, timezone: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "demo-user-3", organization_id: "demo-org", team_id: "demo-team-south", email: "sofia@demo.bee", full_name: "Sofía Méndez", role: "manager", is_active: true, avatar_url: null, phone: null, bio: null, timezone: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "demo-user-4", organization_id: "demo-org", team_id: "demo-team-south", email: "diego@demo.bee", full_name: "Diego Torres", role: "member", is_active: true, avatar_url: null, phone: null, bio: null, timezone: null, created_at: "2026-01-01T00:00:00Z" },
];

const DEMO_USERS_EN: UserOut[] = [
  { id: "demo-user-1", organization_id: "demo-org", team_id: "demo-team-north", email: "ana@demo.bee", full_name: "Ana Garcia", role: "manager", is_active: true, avatar_url: null, phone: null, bio: null, timezone: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "demo-user-2", organization_id: "demo-org", team_id: "demo-team-north", email: "carlos@demo.bee", full_name: "Carlos Ruiz", role: "member", is_active: true, avatar_url: null, phone: null, bio: null, timezone: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "demo-user-3", organization_id: "demo-org", team_id: "demo-team-south", email: "sofia@demo.bee", full_name: "Sofia Mendez", role: "manager", is_active: true, avatar_url: null, phone: null, bio: null, timezone: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "demo-user-4", organization_id: "demo-org", team_id: "demo-team-south", email: "diego@demo.bee", full_name: "Diego Torres", role: "member", is_active: true, avatar_url: null, phone: null, bio: null, timezone: null, created_at: "2026-01-01T00:00:00Z" },
];

export function demoFetchUsers(): UserOut[] {
  return getDemoLocale() === "en" ? DEMO_USERS_EN : DEMO_USERS_ES;
}

export function demoFetchTeams(): TeamOut[] {
  return DEMO_TEAMS;
}

/** Deterministic (index-rotated, not random) so the same opportunity is
 * always "assigned to" the same demo rep across reloads until the next
 * reseed — a leaderboard that reshuffles on every refresh wouldn't read
 * as real. */
function seedOpportunitiesWithReps(locale: Locale): Opportunity[] {
  const reps = demoFetchUsers();
  return getSampleOpportunities(locale).map((opp, i) => ({
    ...opp,
    assigned_to_user_id: opp.assigned_to_user_id ?? reps[i % reps.length].id,
  }));
}

const load = () => loadJSON<Opportunity[]>(OPPORTUNITIES_KEY, seedOpportunitiesWithReps(getDemoLocale()));
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
  const list = loadJSON<Signal[]>(SIGNALS_KEY, getSampleSignals(getDemoLocale()));
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
  const locale = getDemoLocale();
  const set = buildDemoCompanySet(companyName, employeeRange, locale);

  const opportunities = load();
  opportunities.unshift(set.opportunity);
  save(opportunities);

  const signals = loadJSON<Signal[]>(SIGNALS_KEY, getSampleSignals(locale));
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
  const locale = getDemoLocale();
  const set = buildManualOpportunitySet(input, locale);

  const opportunities = load();
  opportunities.unshift(set.opportunity);
  save(opportunities);

  const signals = loadJSON<Signal[]>(SIGNALS_KEY, getSampleSignals(locale));
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
  const locale = getDemoLocale();
  save(structuredClone(getSampleOpportunities(locale)));
  saveJSON(SIGNALS_KEY, structuredClone(getSampleSignals(locale)));
  saveJSON(BATTLECARDS_KEY, []);
  saveJSON(ARTIFACTS_KEY, []);
  saveJSON(NETWORK_KEY, structuredClone(getSeedNetworkConnections(locale)));
  saveJSON(BRAND_PROFILE_KEY, structuredClone(getSeedVoiceProfile(locale)));
  saveJSON(BRAND_FRAGMENTS_KEY, structuredClone(getSeedBrandFragments(locale)));
  saveJSON(STYLE_PROFILE_KEY, structuredClone(getSeedStyleProfile(locale)));
  saveJSON(DEEP_ANOMALIES_KEY, structuredClone(getSeedDeepAnomalies(locale)));
  saveJSON(DLQ_KEY, structuredClone(getSeedDLQEvents(locale)));
  saveJSON(AUDIT_KEY, structuredClone(getSeedAuditEntries(locale)));
  saveJSON(PENDING_ACTIONS_KEY, structuredClone(getSeedPendingActions(locale)));
  saveJSON(TEMPLATES_KEY, structuredClone(getSeedTemplates(locale)));
  saveJSON(SEQUENCES_KEY, structuredClone(getSeedSequences(locale)));
  saveJSON(TASKS_KEY, []);
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

// Battlecard company/lead refs don't carry headcount or revenue (same as
// the real backend's BattlecardCompany schema — see types/domain.ts), so
// demo companies have no real source for these two ICP fit dimensions.
// Rather than leave them permanently null (which would make sizes/
// revenue_ranges the one ICP dimension that can never demonstrate a match
// in the sandbox), each fictional demo company gets a stable pseudo-random
// band derived from its own name — same name always gets the same band
// across reloads, never actually random. This is fabricated the same way
// every other illustrative detail in this dataset already is (deal
// amounts, DISC scores, cycle days) — never applied to a real account.
const DEMO_SIZE_BANDS = ["11-50", "51-200", "201-500", "501-1000"] as const;
const DEMO_REVENUE_BANDS = ["$1M-$10M", "$10M-$50M", "$50M-$100M", "$100M-$500M"] as const;

function stableHash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

function demoCompanySize(companyName: string): string {
  return DEMO_SIZE_BANDS[stableHash(companyName) % DEMO_SIZE_BANDS.length];
}

function demoCompanyRevenueRange(companyName: string): string {
  return DEMO_REVENUE_BANDS[stableHash(`${companyName}-revenue`) % DEMO_REVENUE_BANDS.length];
}

function allBattlecards(): Battlecard[] {
  return [...getSampleBattlecards(getDemoLocale()), ...loadJSON<Battlecard[]>(BATTLECARDS_KEY, [])];
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
      organization_id: null,
      owner_user_id: null,
      name,
      domain: card.company.domain,
      industry: card.company.industry,
      size: demoCompanySize(name),
      country: card.company.country,
      revenue_range: demoCompanyRevenueRange(name),
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
      estimated_value: null,
      source: null,
      next_meeting_at: null,
      meetings_held_count: 0,
      photo_url: null,
    });
  }
  return [...seen.values()];
}

const SUCCESS_PATTERN_MIN_SAMPLES = 3;
const SUCCESS_PATTERN_CONFIDENCE_THRESHOLDS = [5, 20] as const;

function successPatternConfidence(n: number): "low" | "medium" | "high" {
  if (n < SUCCESS_PATTERN_CONFIDENCE_THRESHOLDS[0]) return "low";
  if (n < SUCCESS_PATTERN_CONFIDENCE_THRESHOLDS[1]) return "medium";
  return "high";
}

/** JS port of FeedbackLoopService.get_patterns / StrategyOutcomeRepository.
 * get_win_rates — same grouping (signal_type × playbook × channel), same
 * min-sample floor (3) and confidence thresholds (<5 low, <20 medium, else
 * high), same "closed deals only" scope. Reads the live opportunity/signal
 * store (not just the static seed), so a deal this visitor closed
 * themselves in the sandbox counts too — same "learn" step the real
 * FeedbackLoopService performs, just computed client-side. */
export function demoSuccessPatterns(signalType?: string): {
  signal_type: string;
  playbook: string;
  channel: string;
  generator: string;
  win_rate: number;
  sample_size: number;
  avg_days_to_close: number | null;
  confidence: "low" | "medium" | "high";
}[] {
  const locale = getDemoLocale();
  const opportunities = load();
  const signalTypeById = new Map(
    loadJSON<Signal[]>(SIGNALS_KEY, getSampleSignals(locale)).map((s) => [s.id, s.signal_type]),
  );

  const closed = opportunities.filter(
    (o): o is typeof o & { closed_at: string } =>
      (o.status === "won" || o.status === "lost") && Boolean(o.closed_at) && Boolean(o.strategy.playbook),
  );

  type Group = { total: number; wins: number; cycleDaysSum: number; cycleDaysCount: number };
  const groups = new Map<string, Group>();
  const groupMeta = new Map<string, { signal_type: string; playbook: string; channel: string }>();

  for (const opp of closed) {
    const oppSignalType = (opp.signal_id ? signalTypeById.get(opp.signal_id) : undefined) ?? "other";
    if (signalType && oppSignalType !== signalType) continue;
    const playbook = opp.strategy.playbook ?? "generic_outreach";
    const channel = opp.strategy.channel ?? "email";
    const key = `${oppSignalType}::${playbook}::${channel}`;
    if (!groups.has(key)) {
      groups.set(key, { total: 0, wins: 0, cycleDaysSum: 0, cycleDaysCount: 0 });
      groupMeta.set(key, { signal_type: oppSignalType, playbook, channel });
    }
    const g = groups.get(key)!;
    g.total += 1;
    if (opp.status === "won") g.wins += 1;
    const cycleDays = daysBetween(opp.created_at, opp.closed_at);
    if (cycleDays !== null) {
      g.cycleDaysSum += cycleDays;
      g.cycleDaysCount += 1;
    }
  }

  return [...groups.entries()]
    .filter(([, g]) => g.total >= SUCCESS_PATTERN_MIN_SAMPLES)
    .map(([key, g]) => {
      const meta = groupMeta.get(key)!;
      return {
        signal_type: meta.signal_type,
        playbook: meta.playbook,
        channel: meta.channel,
        generator: `${meta.signal_type}_generator`,
        win_rate: g.wins / g.total,
        sample_size: g.total,
        avg_days_to_close: g.cycleDaysCount > 0 ? g.cycleDaysSum / g.cycleDaysCount : null,
        confidence: successPatternConfidence(g.total),
      };
    })
    .sort((a, b) => b.sample_size - a.sample_size)
    .slice(0, 10);
}

function daysBetween(startIso: string, endIso: string): number | null {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return (end - start) / 86400000;
}

// ── Tasks (opportunity drawer's Tasks panel) ────────────────────────────────
//
// No seed data — a rep's to-dos are theirs to create, never something BEE
// invents on their behalf (same "nothing fabricated for a human decision"
// line the rest of the sandbox draws). What matters here is that the panel
// actually works: create/complete/delete persist locally, same as every
// other mutable corner of the sandbox.

const TASKS_KEY = "bee_demo_tasks_v1";

const loadTasks = () => loadJSON<OpportunityTask[]>(TASKS_KEY, []);
const saveTasks = (list: OpportunityTask[]) => saveJSON(TASKS_KEY, list);

export function demoFetchTasks(params: {
  opportunityId?: string;
  includeCompleted?: boolean;
  overdueOnly?: boolean;
}): OpportunityTask[] {
  let list = loadTasks();
  if (params.opportunityId) list = list.filter((t) => t.opportunity_id === params.opportunityId);
  if (!params.includeCompleted) list = list.filter((t) => !t.completed_at);
  if (params.overdueOnly) {
    const now = Date.now();
    list = list.filter((t) => !t.completed_at && t.due_at && new Date(t.due_at).getTime() < now);
  }
  return list;
}

export function demoCreateTask(body: OpportunityTaskCreateIn): OpportunityTask {
  const list = loadTasks();
  const task: OpportunityTask = {
    id: `demo-task-${Date.now()}`,
    opportunity_id: body.opportunity_id,
    assigned_to_user_id: body.assigned_to_user_id ?? null,
    title: body.title,
    due_at: body.due_at ?? null,
    completed_at: null,
    created_at: new Date().toISOString(),
  };
  list.push(task);
  saveTasks(list);
  return task;
}

function findTaskOrThrow(list: OpportunityTask[], taskId: string): number {
  const idx = list.findIndex((t) => t.id === taskId);
  if (idx === -1) {
    throw new Error(`Demo task ${taskId} not found — it only exists in this browser's local demo data.`);
  }
  return idx;
}

export function demoUpdateTask(taskId: string, body: OpportunityTaskUpdateIn): OpportunityTask {
  const list = loadTasks();
  const idx = findTaskOrThrow(list, taskId);
  const current = list[idx];
  list[idx] = {
    ...current,
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.due_at !== undefined ? { due_at: body.due_at } : {}),
    ...(body.assigned_to_user_id !== undefined ? { assigned_to_user_id: body.assigned_to_user_id } : {}),
    ...(body.completed !== undefined
      ? { completed_at: body.completed ? new Date().toISOString() : null }
      : {}),
  };
  saveTasks(list);
  return list[idx];
}

export function demoDeleteTask(taskId: string): void {
  const list = loadTasks();
  findTaskOrThrow(list, taskId);
  saveTasks(list.filter((t) => t.id !== taskId));
}

// ── Meetings (Calendario) ────────────────────────────────────────────────
//
// Unlike Tasks (deliberately seeded empty — "a rep's to-dos are theirs to
// create"), a calendar with nothing on it doesn't illustrate the feature at
// all — the whole point is showing meetings already tied to real pipeline
// accounts. Seeded relative to "now" (offsets in hours, not fixed dates) so
// it always looks like *this* week regardless of when the sandbox is
// opened, same reasoning `demoFetchSequences`' own execution timestamps use
// elsewhere in this file. User-added meetings persist locally same as
// everything else here.

const MEETINGS_KEY = "bee_demo_meetings_v1";
const HOT_LEAD_SCORE_THRESHOLD = 75;

/** Mirrors app.api.v1.endpoints.meetings._client_context on the backend —
 * same rules, just computed here since /probar never calls that endpoint. */
function demoClientContext(
  opportunity: Opportunity | undefined,
  lead: Lead | undefined,
): MeetingClientContext {
  if (opportunity) {
    if (opportunity.status === "won" || opportunity.opportunity_type === "expansion" || opportunity.opportunity_type === "renewal_risk") {
      return "active_client";
    }
    return "prospect";
  }
  if (lead) {
    return lead.score >= HOT_LEAD_SCORE_THRESHOLD ? "hot_lead" : "prospect";
  }
  return "new_contact";
}

/** `dayOffset`/`hour`/`minute`, not a raw hours-from-now offset — a seed
 * meeting always needs to land inside the calendar's visible business-hour
 * grid (see CalendarPage's own GRID_START_HOUR/GRID_END_HOUR) regardless of
 * what time of day it is when the sandbox happens to be opened. */
function seedTime(dayOffset: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function buildMeeting(partial: {
  id: string;
  title: string;
  purpose: string;
  dayOffset: number;
  hour: number;
  minute?: number;
  durationMinutes: number;
  meetingUrl?: string;
  opportunity?: Opportunity;
  lead?: Lead;
  attendeeUserIds?: string[];
  color?: Meeting["color"];
  attendeeResponses?: Meeting["attendee_responses"];
}): Meeting {
  const opportunity = partial.opportunity;
  const lead = partial.lead ?? undefined;
  return {
    id: partial.id,
    created_by_user_id: demoFetchUsers()[0].id,
    opportunity_id: opportunity?.id ?? null,
    lead_id: lead?.id ?? null,
    title: partial.title,
    purpose: partial.purpose,
    starts_at: seedTime(partial.dayOffset, partial.hour, partial.minute ?? 0),
    duration_minutes: partial.durationMinutes,
    meeting_url: partial.meetingUrl ?? null,
    attendee_user_ids: partial.attendeeUserIds ?? [],
    attendee_responses: partial.attendeeResponses ?? {},
    color: partial.color ?? null,
    completed_at: null,
    created_at: new Date().toISOString(),
    company_name: null,
    contact_name: lead?.full_name ?? null,
    client_context: demoClientContext(opportunity, lead),
  };
}

function seedMeetings(locale: Locale): Meeting[] {
  const opps = seedOpportunitiesWithReps(locale).filter((o) => !["won", "lost", "dismissed"].includes(o.status));
  const leads = demoFetchLeads();
  const users = demoFetchUsers();
  const oppByType = (type: string) => opps.find((o) => o.opportunity_type === type);
  const hotLead = leads.find((l) => l.score >= HOT_LEAD_SCORE_THRESHOLD) ?? leads[0];
  const anyOpp = opps[0];
  const secondOpp = opps[1] ?? anyOpp;

  return [
    buildMeeting({
      id: "demo-meeting-1",
      title: locale === "en" ? "Discovery call" : "Llamada de descubrimiento",
      purpose:
        locale === "en"
          ? "First conversation — understand their current stack and pain points."
          : "Primera conversación — entender su stack actual y sus dolores.",
      dayOffset: 0,
      hour: 14,
      durationMinutes: 30,
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      lead: hotLead,
      attendeeUserIds: [users[0].id],
    }),
    buildMeeting({
      id: "demo-meeting-2",
      title: locale === "en" ? "Renewal check-in" : "Check-in de renovación",
      purpose:
        locale === "en"
          ? "Review usage since last quarter, confirm renewal terms."
          : "Revisar uso desde el trimestre pasado, confirmar términos de renovación.",
      dayOffset: 1,
      hour: 10,
      durationMinutes: 45,
      meetingUrl: "https://meet.google.com/klm-nopq-rst",
      opportunity: oppByType("renewal_risk") ?? oppByType("expansion") ?? anyOpp,
      attendeeUserIds: [users[0].id, users[1].id],
    }),
    buildMeeting({
      id: "demo-meeting-3",
      title: locale === "en" ? "Pricing follow-up" : "Seguimiento de precio",
      purpose:
        locale === "en"
          ? "Address the objections raised last call, walk through the proposal."
          : "Responder a las objeciones de la última llamada, repasar la propuesta.",
      dayOffset: 2,
      hour: 16,
      minute: 30,
      durationMinutes: 30,
      opportunity: secondOpp,
      attendeeUserIds: [users[2] ? users[2].id : users[0].id],
    }),
    buildMeeting({
      id: "demo-meeting-4",
      title: locale === "en" ? "Team sync — pipeline review" : "Sync de equipo — revisión de pipeline",
      purpose:
        locale === "en"
          ? "Weekly walkthrough of what's moving and what's stuck."
          : "Repaso semanal de qué avanza y qué está trabado.",
      dayOffset: 0,
      hour: 9,
      durationMinutes: 30,
      attendeeUserIds: users.map((u) => u.id),
      color: "chart-2",
    }),
    buildMeeting({
      id: "demo-meeting-5",
      title: locale === "en" ? "Demo — product walkthrough" : "Demo — recorrido del producto",
      purpose:
        locale === "en"
          ? "Live walkthrough of the signal-to-strategy flow."
          : "Recorrido en vivo del flujo de señal a estrategia.",
      dayOffset: 3,
      hour: 11,
      durationMinutes: 45,
      meetingUrl: "https://meet.google.com/uvw-xyzz-123",
      opportunity: oppByType("new_logo") ?? anyOpp,
      attendeeUserIds: [users[1].id],
    }),
  ];
}

const loadMeetings = () => loadJSON<Meeting[]>(MEETINGS_KEY, seedMeetings(getDemoLocale()));
const saveMeetings = (list: Meeting[]) => saveJSON(MEETINGS_KEY, list);

export function demoFetchMeetings(params?: { startsAfter?: string; startsBefore?: string }): Meeting[] {
  let list = loadMeetings();
  if (params?.startsAfter) list = list.filter((m) => m.starts_at >= params.startsAfter!);
  if (params?.startsBefore) list = list.filter((m) => m.starts_at <= params.startsBefore!);
  return [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export function demoCreateMeeting(body: MeetingCreateIn): Meeting {
  const list = loadMeetings();
  const opportunity = body.opportunity_id ? demoFetchOpportunities().find((o) => o.id === body.opportunity_id) : undefined;
  const lead = body.lead_id ? demoFetchLeads().find((l) => l.id === body.lead_id) : undefined;
  const company_id = opportunity?.company_id ?? null;
  const company = company_id ? demoFetchCompanies().find((c) => c.id === company_id) : undefined;
  const meeting: Meeting = {
    id: `demo-meeting-${Date.now()}`,
    created_by_user_id: demoFetchUsers()[0].id,
    opportunity_id: body.opportunity_id ?? null,
    lead_id: body.lead_id ?? null,
    title: body.title,
    purpose: body.purpose ?? null,
    starts_at: body.starts_at,
    duration_minutes: body.duration_minutes ?? 30,
    meeting_url: body.meeting_url ?? null,
    attendee_user_ids: body.attendee_user_ids ?? [],
    attendee_responses: {},
    color: body.color ?? null,
    completed_at: null,
    created_at: new Date().toISOString(),
    company_name: company?.name ?? null,
    contact_name: lead?.full_name ?? null,
    client_context: demoClientContext(opportunity, lead),
  };
  list.push(meeting);
  saveMeetings(list);
  return meeting;
}

function findMeetingOrThrow(list: Meeting[], id: string): number {
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) {
    throw new Error(`Demo meeting ${id} not found — it only exists in this browser's local demo data.`);
  }
  return idx;
}

export function demoUpdateMeeting(meetingId: string, body: MeetingUpdateIn): Meeting {
  const list = loadMeetings();
  const idx = findMeetingOrThrow(list, meetingId);
  const current = list[idx];
  list[idx] = {
    ...current,
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.purpose !== undefined ? { purpose: body.purpose } : {}),
    ...(body.starts_at !== undefined ? { starts_at: body.starts_at } : {}),
    ...(body.duration_minutes !== undefined ? { duration_minutes: body.duration_minutes } : {}),
    ...(body.meeting_url !== undefined ? { meeting_url: body.meeting_url } : {}),
    ...(body.attendee_user_ids !== undefined ? { attendee_user_ids: body.attendee_user_ids } : {}),
    ...(body.color !== undefined ? { color: body.color } : {}),
  };
  saveMeetings(list);
  return list[idx];
}

export function demoCompleteMeeting(meetingId: string): Meeting {
  const list = loadMeetings();
  const idx = findMeetingOrThrow(list, meetingId);
  if (list[idx].completed_at === null) {
    // Demo-only simplification: marks the meeting completed same as the
    // real backend, but doesn't also bump a linked lead/opportunity's
    // meetings_held_count — those aren't their own mutable local list in
    // the sandbox (see this file's own note on companies/leads being
    // derived, not stored), so there's nothing to increment here.
    list[idx] = { ...list[idx], completed_at: new Date().toISOString() };
    saveMeetings(list);
  }
  return list[idx];
}

export function demoRespondToMeeting(meetingId: string, response: "accepted" | "declined"): Meeting {
  const list = loadMeetings();
  const idx = findMeetingOrThrow(list, meetingId);
  const responderId = demoFetchUsers()[0].id;
  list[idx] = {
    ...list[idx],
    attendee_responses: { ...list[idx].attendee_responses, [responderId]: response },
  };
  saveMeetings(list);
  return list[idx];
}

export function demoDeleteMeeting(meetingId: string): void {
  const list = loadMeetings();
  findMeetingOrThrow(list, meetingId);
  saveMeetings(list.filter((m) => m.id !== meetingId));
}

// ── Message templates (Biblioteca de mensajes) ──────────────────────────────

const TEMPLATES_KEY = "bee_demo_templates_v1";

const SEED_TEMPLATES_ES: MessageTemplate[] = [
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

const SEED_TEMPLATES_EN: MessageTemplate[] = [
  {
    id: "demo-template-funding",
    name: "Post-funding opener",
    channel: "email",
    subject: "Congrats on the round — quick question",
    body:
      "Hi {{first_name}},\n\nSaw that {{company_name}} just closed a round — congrats. " +
      "Worth a 15-minute call to talk through how you're thinking about scaling the sales team?\n\nBest,",
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-template-hiring-linkedin",
    name: "LinkedIn follow-up — new hire",
    channel: "linkedin",
    subject: null,
    body:
      "Hi {{first_name}}, saw you joined {{company_name}} — congrats on the new role. " +
      "I'd love to share how we help teams at a similar stage shorten their sales cycle. " +
      "Got 15 minutes this week?",
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-template-reactivation",
    name: "Re-engagement — no response",
    channel: "email",
    subject: "Still worth talking?",
    body:
      "Hi {{first_name}},\n\nDon't want to be a bother — is this still a good time to talk " +
      "about {{company_name}}? If not, just say the word and I won't follow up again.\n\nBest,",
    created_at: new Date().toISOString(),
  },
];

function getSeedTemplates(locale: Locale): MessageTemplate[] {
  return locale === "en" ? SEED_TEMPLATES_EN : SEED_TEMPLATES_ES;
}

const loadTemplates = () => loadJSON<MessageTemplate[]>(TEMPLATES_KEY, getSeedTemplates(getDemoLocale()));
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

const SEED_SEQUENCES_ES: DynamicSequenceOut[] = [
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

const SEED_SEQUENCES_EN: DynamicSequenceOut[] = [
  {
    id: "demo-sequence-funding",
    name: "Funding → first contact",
    description: "3-step cadence for a newly detected funding-round signal.",
    signal_type: "funding_round",
    industry: null,
    seniority: null,
    entry_step_id: "s1",
    steps: [
      {
        id: "s1",
        name: "Send email",
        action: "send_email",
        channel: "email",
        transitions: [{ condition: "no_response", next_step_id: "s2", delay_days: 3 }],
        max_wait_days: 7,
        notes: null,
      },
      {
        id: "s2",
        name: "Connection request",
        action: "linkedin_connect",
        channel: "linkedin",
        transitions: [{ condition: "no_response", next_step_id: "s3", delay_days: 4 }],
        max_wait_days: 7,
        notes: null,
      },
      {
        id: "s3",
        name: "Follow-up",
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

function getSeedSequences(locale: Locale): DynamicSequenceOut[] {
  return locale === "en" ? SEED_SEQUENCES_EN : SEED_SEQUENCES_ES;
}

const loadSequences = () => loadJSON<DynamicSequenceOut[]>(SEQUENCES_KEY, getSeedSequences(getDemoLocale()));
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

// ── Red / Network Navigator ─────────────────────────────────────────────────
//
// Control, Red, Voz de marca and Resiliencia were originally left out of the
// sandbox on purpose — they surface real backend/infrastructure state
// (worker health, audit logs, relationship graphs), and inventing that felt
// like lying about the system rather than illustrating a product feature.
// The BEE team explicitly asked for these 4 to be simulated fully anyway —
// "como si fuera real", same standard as the rest of `/probar` — so this
// section (and the 3 below it) is that: a local dataset shaped exactly like
// what the real NetworkNavigator/PersonalBrandService/DLQ/AuditTrail return,
// clearly still labeled "Datos demo" wherever the real UI shows that badge.

const NETWORK_KEY = "bee_demo_network_v1";

const SEED_NETWORK_CONNECTIONS_ES: NetworkConnection[] = [
  {
    id: "demo-network-1",
    contact_name: "Marina Solís",
    contact_company: "Cumbre Salud",
    contact_domain: "cumbresalud.co",
    contact_title: "COO",
    connection_type: "first_degree",
    relationship_strength: 9,
    notes: "Ex-colega de una ronda de inversión anterior.",
    tags: ["salud digital"],
    industries: ["Salud digital"],
    interaction_count: 14,
    active: true,
    created_at: new Date(Date.now() - 400 * 86400000).toISOString(),
  },
  {
    id: "demo-network-2",
    contact_name: "Diego Farías",
    contact_company: "Nimbus Cloud Systems",
    contact_domain: "nimbuscloud.io",
    contact_title: "VP Engineering",
    connection_type: "second_degree",
    relationship_strength: 6,
    notes: "Conocido a través de un excompañero de Silo Data Works.",
    tags: ["cloud"],
    industries: ["Infraestructura cloud"],
    interaction_count: 3,
    active: true,
    created_at: new Date(Date.now() - 220 * 86400000).toISOString(),
  },
  {
    id: "demo-network-3",
    contact_name: "Renata Cabrera",
    contact_company: "Onda Media Group",
    contact_domain: "ondamedia.mx",
    contact_title: "Directora Comercial",
    connection_type: "alumni",
    relationship_strength: 7,
    notes: "Misma generación de la universidad.",
    tags: ["medios", "alumni"],
    industries: ["Medios"],
    interaction_count: 5,
    active: true,
    created_at: new Date(Date.now() - 310 * 86400000).toISOString(),
  },
  {
    id: "demo-network-4",
    contact_name: "Pablo Undurraga",
    contact_company: "Horizonte Legal",
    contact_domain: "horizontelegal.cl",
    contact_title: "Socio Director",
    connection_type: "referral",
    relationship_strength: 8,
    notes: "Referido directo por un cliente actual.",
    tags: ["legal"],
    industries: ["LegalTech"],
    interaction_count: 9,
    active: true,
    created_at: new Date(Date.now() - 150 * 86400000).toISOString(),
  },
  {
    id: "demo-network-5",
    contact_name: "Laura Kim",
    contact_company: "Bright Retail Co",
    contact_domain: "brightretail.com",
    contact_title: "Head of Sales",
    connection_type: "community",
    relationship_strength: 4,
    notes: "Coincidimos en un evento de la industria retail.",
    tags: ["retail"],
    industries: ["Retail"],
    interaction_count: 1,
    active: true,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
  {
    id: "demo-network-6",
    contact_name: "Andrés Molina",
    contact_company: "Cobre Insurtech",
    contact_domain: "cobreinsurtech.co",
    contact_title: "VP Growth",
    connection_type: "first_degree",
    relationship_strength: 8,
    notes: "Trabajamos juntos hace 3 años, sigue siendo un aliado cercano.",
    tags: ["insurtech"],
    industries: ["Seguros"],
    interaction_count: 11,
    active: true,
    created_at: new Date(Date.now() - 500 * 86400000).toISOString(),
  },
];

const SEED_NETWORK_CONNECTIONS_EN: NetworkConnection[] = [
  {
    id: "demo-network-1",
    contact_name: "Marina Solís",
    contact_company: "Cumbre Salud",
    contact_domain: "cumbresalud.co",
    contact_title: "COO",
    connection_type: "first_degree",
    relationship_strength: 9,
    notes: "Former colleague from an earlier funding round.",
    tags: ["digital health"],
    industries: ["Digital health"],
    interaction_count: 14,
    active: true,
    created_at: new Date(Date.now() - 400 * 86400000).toISOString(),
  },
  {
    id: "demo-network-2",
    contact_name: "Diego Farías",
    contact_company: "Nimbus Cloud Systems",
    contact_domain: "nimbuscloud.io",
    contact_title: "VP Engineering",
    connection_type: "second_degree",
    relationship_strength: 6,
    notes: "Met through a former colleague at Silo Data Works.",
    tags: ["cloud"],
    industries: ["Cloud infrastructure"],
    interaction_count: 3,
    active: true,
    created_at: new Date(Date.now() - 220 * 86400000).toISOString(),
  },
  {
    id: "demo-network-3",
    contact_name: "Renata Cabrera",
    contact_company: "Onda Media Group",
    contact_domain: "ondamedia.mx",
    contact_title: "Commercial Director",
    connection_type: "alumni",
    relationship_strength: 7,
    notes: "Same university class.",
    tags: ["media", "alumni"],
    industries: ["Media"],
    interaction_count: 5,
    active: true,
    created_at: new Date(Date.now() - 310 * 86400000).toISOString(),
  },
  {
    id: "demo-network-4",
    contact_name: "Pablo Undurraga",
    contact_company: "Horizonte Legal",
    contact_domain: "horizontelegal.cl",
    contact_title: "Managing Partner",
    connection_type: "referral",
    relationship_strength: 8,
    notes: "Direct referral from a current client.",
    tags: ["legal"],
    industries: ["LegalTech"],
    interaction_count: 9,
    active: true,
    created_at: new Date(Date.now() - 150 * 86400000).toISOString(),
  },
  {
    id: "demo-network-5",
    contact_name: "Laura Kim",
    contact_company: "Bright Retail Co",
    contact_domain: "brightretail.com",
    contact_title: "Head of Sales",
    connection_type: "community",
    relationship_strength: 4,
    notes: "Met at a retail industry event.",
    tags: ["retail"],
    industries: ["Retail"],
    interaction_count: 1,
    active: true,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
  {
    id: "demo-network-6",
    contact_name: "Andrés Molina",
    contact_company: "Cobre Insurtech",
    contact_domain: "cobreinsurtech.co",
    contact_title: "VP Growth",
    connection_type: "first_degree",
    relationship_strength: 8,
    notes: "Worked together 3 years ago — still a close ally.",
    tags: ["insurtech"],
    industries: ["Insurance"],
    interaction_count: 11,
    active: true,
    created_at: new Date(Date.now() - 500 * 86400000).toISOString(),
  },
];

function getSeedNetworkConnections(locale: Locale): NetworkConnection[] {
  return locale === "en" ? SEED_NETWORK_CONNECTIONS_EN : SEED_NETWORK_CONNECTIONS_ES;
}

const loadNetwork = () => loadJSON<NetworkConnection[]>(NETWORK_KEY, getSeedNetworkConnections(getDemoLocale()));
const saveNetwork = (list: NetworkConnection[]) => saveJSON(NETWORK_KEY, list);

export function demoFetchNetworkConnections(): NetworkConnection[] {
  return loadNetwork();
}

export function demoAddNetworkConnection(payload: {
  contact_name: string;
  contact_company: string;
  contact_domain: string;
  contact_title?: string;
  relationship_strength: number;
  connection_type?: string;
  notes?: string;
}): NetworkConnection {
  const created: NetworkConnection = {
    id: `demo-network-${Date.now()}`,
    contact_name: payload.contact_name,
    contact_company: payload.contact_company,
    contact_domain: payload.contact_domain,
    contact_title: payload.contact_title ?? null,
    connection_type: payload.connection_type ?? "first_degree",
    relationship_strength: payload.relationship_strength,
    notes: payload.notes ?? null,
    tags: [],
    industries: [],
    interaction_count: 0,
    active: true,
    created_at: new Date().toISOString(),
  };
  const list = loadNetwork();
  list.unshift(created);
  saveNetwork(list);
  return created;
}

export function demoNetworkStats(): NetworkStats {
  const all = loadNetwork().filter((c) => c.active);
  if (all.length === 0) {
    return {
      total_connections: 0,
      first_degree_count: 0,
      second_degree_count: 0,
      top_industries: [],
      avg_relationship_strength: 0,
      companies_covered: 0,
    };
  }
  const industryCounts = new Map<string, number>();
  for (const conn of all) {
    for (const industry of conn.industries) {
      industryCounts.set(industry, (industryCounts.get(industry) ?? 0) + 1);
    }
  }
  const topIndustries = [...industryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
  return {
    total_connections: all.length,
    first_degree_count: all.filter((c) => c.connection_type === "first_degree").length,
    second_degree_count: all.filter((c) => c.connection_type === "second_degree").length,
    top_industries: topIndustries,
    avg_relationship_strength:
      Math.round((all.reduce((sum, c) => sum + c.relationship_strength, 0) / all.length) * 10) / 10,
    companies_covered: new Set(all.map((c) => c.contact_domain)).size,
  };
}

/** Local port of NetworkNavigator's path search (direct connections only —
 * no synthetic 2nd-degree graph traversal, that would mean fabricating
 * people who don't appear anywhere else in the demo data). Honest either
 * way: a real target domain not in the seed list gets the same
 * `cold_outreach_fallback: true` a real, unconnected prospect would. */
export function demoFindIntroPaths(params: {
  target_domain: string;
  target_company?: string;
}): NetworkQueryResult {
  const locale = getDemoLocale();
  const domain = params.target_domain.toLowerCase().trim();
  const companyLabel = params.target_company || domain;
  const matches = loadNetwork().filter((c) => c.active && c.contact_domain.toLowerCase() === domain);

  const paths: IntroPath[] = matches
    .sort((a, b) => b.relationship_strength - a.relationship_strength)
    .map((conn) => {
      const introType = conn.connection_type === "referral" ? "referral" : conn.connection_type === "alumni" ? "alumni" : "warm_intro";
      const connectionTypeLabel = conn.connection_type.replace(/_/g, " ");
      return {
        target_name: null,
        target_company: companyLabel,
        target_domain: domain,
        path_length: 1,
        intro_type: introType,
        strength_score: conn.relationship_strength,
        connector_name: conn.contact_name,
        connector_id: conn.id,
        steps: [
          {
            person: conn.contact_name,
            company: conn.contact_company,
            relationship_to_next:
              locale === "en"
                ? `Direct connection (${connectionTypeLabel})`
                : `Conexión directa (${connectionTypeLabel})`,
            strength: conn.relationship_strength,
          },
        ],
        action_recommendation:
          locale === "en"
            ? `Ask ${conn.contact_name} for a warm introduction at ${companyLabel} — the relationship is strong (${conn.relationship_strength}/10).`
            : `Pídele a ${conn.contact_name} una presentación cálida en ${companyLabel} — la relación es fuerte (${conn.relationship_strength}/10).`,
        draft_ask:
          locale === "en"
            ? `Hi ${conn.contact_name.split(" ")[0]},\n\nWould you be up for introducing me to someone at ${companyLabel}? We're exploring how BEE would fit their sales operation and your take would carry a lot of weight.\n\nThanks,`
            : `Hola ${conn.contact_name.split(" ")[0]},\n\n¿Me harías el favor de presentarme con alguien de ${companyLabel}? Estamos viendo cómo encajaría BEE en su operación comercial y tu opinión pesaría mucho.\n\nGracias,`,
      };
    });

  const best = paths[0] ?? null;
  const coverage: NetworkQueryResult["network_coverage"] =
    paths.length === 0 ? "none" : (best?.strength_score ?? 0) >= 7 ? "strong" : (best?.strength_score ?? 0) >= 4 ? "moderate" : "weak";

  return {
    target_company: companyLabel,
    target_domain: domain,
    paths_found: paths,
    best_path: best,
    cold_outreach_fallback: paths.length === 0,
    network_coverage: coverage,
  };
}

// ── Voz de marca — PersonalBrandService ─────────────────────────────────────

const BRAND_PROFILE_KEY = "bee_demo_brand_profile_v1";
const BRAND_FRAGMENTS_KEY = "bee_demo_brand_fragments_v1";

const SEED_VOICE_PROFILE_ES: VoiceProfile = {
  id: "demo-voice-profile",
  display_name: "Alejandro Rivas",
  title: "CEO",
  language: "es",
  tone_descriptors: ["analítico", "directo", "cercano"],
  authority_topics: ["Inteligencia de ventas B2B", "IA aplicada a revenue", "Go-to-market en LatAm"],
  forbidden_phrases: ["Espero que estés bien", "Solo quería contactarte"],
  max_sentence_words: 22,
  use_emojis: false,
  preferred_cta: "¿Vale la pena una llamada de 15 minutos?",
  bio_summary:
    "Fundador y CEO — construyo BEE para que los equipos comerciales prioricen con datos, no con corazonadas.",
  is_active: true,
  created_at: new Date(Date.now() - 260 * 86400000).toISOString(),
  updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
};

const SEED_VOICE_PROFILE_EN: VoiceProfile = {
  id: "demo-voice-profile",
  display_name: "Alejandro Rivas",
  title: "CEO",
  language: "en",
  tone_descriptors: ["analytical", "direct", "approachable"],
  authority_topics: ["B2B sales intelligence", "AI applied to revenue", "Go-to-market in Latin America"],
  forbidden_phrases: ["Hope you're doing well", "Just wanted to reach out"],
  max_sentence_words: 22,
  use_emojis: false,
  preferred_cta: "Worth a 15-minute call?",
  bio_summary:
    "Founder and CEO — building BEE so sales teams prioritize with data, not gut feel.",
  is_active: true,
  created_at: new Date(Date.now() - 260 * 86400000).toISOString(),
  updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
};

function getSeedVoiceProfile(locale: Locale): VoiceProfile {
  return locale === "en" ? SEED_VOICE_PROFILE_EN : SEED_VOICE_PROFILE_ES;
}

const SEED_BRAND_FRAGMENTS_ES: BrandFragment[] = [
  {
    id: "demo-fragment-1",
    profile_id: "demo-voice-profile",
    content:
      "Dejamos de perseguir cada señal y empezamos a priorizar las que de verdad predicen ingresos — el pipeline no creció en volumen, creció en calidad.",
    category: "key_insight",
    tags: ["priorización", "pipeline"],
    source: null,
    performance_score: 0.82,
    used_count: 6,
    last_used_at: new Date(Date.now() - 9 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
  },
  {
    id: "demo-fragment-2",
    profile_id: "demo-voice-profile",
    content: "Hablemos de números, no de promesas.",
    category: "signature_phrase",
    tags: ["cierre"],
    source: null,
    performance_score: 0.76,
    used_count: 11,
    last_used_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 200 * 86400000).toISOString(),
  },
  {
    id: "demo-fragment-3",
    profile_id: "demo-voice-profile",
    content: "3 señales que de verdad predicen una compra — ninguna es 'visitó la página de precios'. (hilo)",
    category: "example_post",
    tags: ["contenido", "linkedin"],
    source: "linkedin",
    performance_score: 0.69,
    used_count: 2,
    last_used_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
  },
];

const SEED_BRAND_FRAGMENTS_EN: BrandFragment[] = [
  {
    id: "demo-fragment-1",
    profile_id: "demo-voice-profile",
    content:
      "We stopped chasing every signal and started prioritizing the ones that actually predict revenue — pipeline didn't grow in volume, it grew in quality.",
    category: "key_insight",
    tags: ["prioritization", "pipeline"],
    source: null,
    performance_score: 0.82,
    used_count: 6,
    last_used_at: new Date(Date.now() - 9 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
  },
  {
    id: "demo-fragment-2",
    profile_id: "demo-voice-profile",
    content: "Let's talk numbers, not promises.",
    category: "signature_phrase",
    tags: ["closing"],
    source: null,
    performance_score: 0.76,
    used_count: 11,
    last_used_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 200 * 86400000).toISOString(),
  },
  {
    id: "demo-fragment-3",
    profile_id: "demo-voice-profile",
    content: "3 signals that actually predict a purchase — none of them is 'visited the pricing page'. (thread)",
    category: "example_post",
    tags: ["content", "linkedin"],
    source: "linkedin",
    performance_score: 0.69,
    used_count: 2,
    last_used_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
  },
];

function getSeedBrandFragments(locale: Locale): BrandFragment[] {
  return locale === "en" ? SEED_BRAND_FRAGMENTS_EN : SEED_BRAND_FRAGMENTS_ES;
}

const loadBrandProfile = () => loadJSON<VoiceProfile | null>(BRAND_PROFILE_KEY, getSeedVoiceProfile(getDemoLocale()));
const loadBrandFragments = () => loadJSON<BrandFragment[]>(BRAND_FRAGMENTS_KEY, getSeedBrandFragments(getDemoLocale()));

export function demoFetchBrandProfile(): VoiceProfile | null {
  return loadBrandProfile();
}

export function demoCreateBrandProfile(data: {
  display_name: string;
  title?: string;
  language?: string;
  tone_descriptors?: string[];
  authority_topics?: string[];
  forbidden_phrases?: string[];
  preferred_cta?: string;
  bio_summary?: string;
}): VoiceProfile {
  const now = new Date().toISOString();
  const created: VoiceProfile = {
    id: "demo-voice-profile",
    display_name: data.display_name,
    title: data.title ?? null,
    language: data.language ?? "es",
    tone_descriptors: data.tone_descriptors ?? [],
    authority_topics: data.authority_topics ?? [],
    forbidden_phrases: data.forbidden_phrases ?? [],
    max_sentence_words: 22,
    use_emojis: false,
    preferred_cta: data.preferred_cta ?? null,
    bio_summary: data.bio_summary ?? null,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  saveJSON(BRAND_PROFILE_KEY, created);
  return created;
}

const EXTRACT_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be",
  "been", "to", "of", "in", "on", "for", "with", "that", "this", "it", "as",
  "at", "by", "from", "we", "our", "you", "your", "i", "they", "their",
  "he", "she", "his", "her", "its", "not", "have", "has", "had", "will",
  "would", "can", "could", "should", "about", "into", "up", "out", "if",
  "so", "than", "then", "just", "also", "more", "most", "very", "get",
  "got", "us", "them", "what", "when", "how", "all", "there", "some",
  "el", "la", "los", "las", "un", "una", "y", "o", "pero", "es", "son",
  "de", "en", "para", "con", "que", "este", "esta", "nuestro", "nuestra",
]);
const EXTRACT_CTA_KEYWORDS = [
  "schedule", "book a", "let's talk", "let's chat", "reach out", "reply",
  "call this week", "worth a chat", "grab time", "grab 15", "happy to",
  "would you", "would love", "make sense", "agendar", "hablemos",
  "conversar", "escríbeme", "contáctame",
];

/**
 * demoExtractVoiceProfile — client-side stand-in for the real LLM/heuristic
 * extraction endpoint. Mirrors the backend's heuristic fallback: every
 * proposed field is derived deterministically from the pasted text itself —
 * word frequency, punctuation, sentence structure — never invented content,
 * same honesty rule demoResearchCompany already follows for account briefs.
 */
export function demoExtractVoiceProfile(rawText: string): VoiceProfileExtractResult {
  const text = rawText.trim();
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const words = text.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]+/g) ?? [];

  const tone: string[] = [];
  const exclaimRatio = (text.match(/!/g)?.length ?? 0) / Math.max(sentences.length, 1);
  if (exclaimRatio > 0.15) tone.push("energetic");
  if (text.includes("?")) tone.push("conversational");
  const avgSentenceWords = words.length / Math.max(sentences.length, 1);
  if (avgSentenceWords <= 12) tone.push("concise");
  else if (avgSentenceWords >= 22) tone.push("detailed");
  if (/\d/.test(text)) tone.push("data-driven");
  if (tone.length === 0) tone.push("professional");

  const capitalized = words.filter((w) => /^[A-ZÀ-Þ]/.test(w) && w.length > 2 && !EXTRACT_STOPWORDS.has(w.toLowerCase()));
  const capCounts = new Map<string, number>();
  for (const w of capitalized) capCounts.set(w, (capCounts.get(w) ?? 0) + 1);
  const topics = [...capCounts.entries()].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).map(([w]) => w);
  if (topics.length < 3) {
    const lowerCounts = new Map<string, number>();
    for (const w of words) {
      const lw = w.toLowerCase();
      if (lw.length > 3 && !EXTRACT_STOPWORDS.has(lw)) lowerCounts.set(lw, (lowerCounts.get(lw) ?? 0) + 1);
    }
    const ranked = [...lowerCounts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
    for (const w of ranked) {
      if (topics.length >= 5) break;
      if (!topics.some((t) => t.toLowerCase() === w)) topics.push(w);
    }
  }

  const cta = [...sentences].reverse().find((s) => EXTRACT_CTA_KEYWORDS.some((k) => s.toLowerCase().includes(k))) ?? null;
  const bioSummary = sentences.length > 0 ? sentences[0].slice(0, 280) : null;

  return {
    title: null,
    tone_descriptors: tone.slice(0, 5),
    authority_topics: topics.slice(0, 5),
    forbidden_phrases: [],
    preferred_cta: cta,
    bio_summary: bioSummary,
    generated_by: "demo",
    model_used: null,
  };
}

/**
 * demoPreviewBrandVoice — client-side stand-in for the real LLM/template
 * preview endpoint. Mirrors PersonalBrandService's template fallback
 * (_template_generic_preview/_template_branded_preview) exactly, so the
 * demo and the real no-LLM-configured path read identically. Built only
 * from the profile's own already-configured fields — same honesty rule
 * every other demo synthesis function in this file follows.
 */
export function demoPreviewBrandVoice(topic: string): BrandVoicePreviewResult {
  const profile = loadBrandProfile();
  const generic =
    `Excited to share some thoughts on ${topic}. We're committed to delivering value and driving ` +
    "results for our customers. Let's connect if this resonates with you!";

  if (!profile) {
    return { topic, generic_version: generic, branded_version: generic, generated_by: "demo", model_used: null };
  }

  const tone = profile.tone_descriptors[0];
  const leadTopic = profile.authority_topics[0];
  const emoji = profile.use_emojis ? " 🔥" : "";
  const parts = [`${topic.charAt(0).toUpperCase()}${topic.slice(1)}.${emoji}`];
  if (leadTopic) parts.push(`This is exactly the kind of thing we obsess over in ${leadTopic}.`);
  if (tone) parts.push(`(Written ${tone} — no filler, no jargon.)`);
  if (profile.preferred_cta) parts.push(profile.preferred_cta);

  return { topic, generic_version: generic, branded_version: parts.join(" "), generated_by: "demo", model_used: null };
}

export function demoAddBrandFragment(
  profileId: string,
  data: { content: string; category: string; tags?: string[]; source?: string },
): BrandFragment {
  const created: BrandFragment = {
    id: `demo-fragment-${Date.now()}`,
    profile_id: profileId,
    content: data.content,
    category: data.category,
    tags: data.tags ?? [],
    source: data.source ?? null,
    performance_score: null,
    used_count: 0,
    last_used_at: null,
    created_at: new Date().toISOString(),
  };
  const list = loadBrandFragments();
  list.unshift(created);
  saveJSON(BRAND_FRAGMENTS_KEY, list);
  return created;
}

export function demoListBrandFragments(profileId: string): BrandFragment[] {
  return loadBrandFragments().filter((f) => f.profile_id === profileId);
}

export function demoDeleteBrandFragment(fragmentId: string): void {
  const list = loadBrandFragments().filter((f) => f.id !== fragmentId);
  saveJSON(BRAND_FRAGMENTS_KEY, list);
}

// ── TrendAnalyst — Market Insights ──────────────────────────────────────────
// Read-only, not user-editable (real MarketInsight rows are written by a
// throttled background TrendAnalyst.analyze() call during signal ingestion —
// see that service's docstring), so no localStorage-backed store like the
// sections above: just locale-aware static seed data, same shape a real
// deployment would eventually accumulate on its own.

const SEED_MARKET_INSIGHTS_ES: MarketInsight[] = [
  {
    id: "demo-insight-1",
    insight_type: "volume_spike",
    signal_type: "funding_round",
    industry: "Fintech",
    title: "Repunte de rondas de financiamiento en Fintech LatAm",
    description:
      "3.2x más señales de funding_round en Fintech esta semana vs. el promedio de las 4 anteriores — 9 empresas, no una sola.",
    tactical_implication:
      "Prioriza el alcance a cuentas Fintech con ronda reciente: la ventana de decisión post-funding es corta.",
    confidence: 0.81,
    evidence_count: 9,
    is_active: true,
    expires_at: null,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "demo-insight-2",
    insight_type: "sector_momentum",
    signal_type: null,
    industry: "Logística",
    title: "Logística acelera contrataciones comerciales",
    description:
      "El sector Logística concentra el 24% de las señales de hiring de los últimos 14 días — el doble que hace un mes.",
    tactical_implication: "Un equipo comercial que crece suele venir con presupuesto nuevo recién aprobado.",
    confidence: 0.68,
    evidence_count: 14,
    is_active: true,
    expires_at: null,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: "demo-insight-3",
    insight_type: "competitive_cluster",
    signal_type: "tech_adoption",
    industry: null,
    title: "Adopción de stack de IA concentrada en 3 verticales",
    description:
      "Las señales de tech_adoption relacionadas con IA se concentran en Salud digital, EdTech y Fintech — no están distribuidas parejo.",
    tactical_implication: "El mensaje de posicionamiento debería variar por vertical, no ser uno solo genérico.",
    confidence: 0.59,
    evidence_count: 11,
    is_active: true,
    expires_at: null,
    created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
  },
];

const SEED_MARKET_INSIGHTS_EN: MarketInsight[] = [
  {
    id: "demo-insight-1",
    insight_type: "volume_spike",
    signal_type: "funding_round",
    industry: "Fintech",
    title: "Funding-round spike in LatAm Fintech",
    description:
      "3.2x more funding_round signals in Fintech this week vs. the prior 4-week average — 9 companies, not just one.",
    tactical_implication:
      "Prioritize outreach to Fintech accounts with a recent round: the post-funding decision window is short.",
    confidence: 0.81,
    evidence_count: 9,
    is_active: true,
    expires_at: null,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "demo-insight-2",
    insight_type: "sector_momentum",
    signal_type: null,
    industry: "Logistics",
    title: "Logistics is ramping up sales hiring",
    description:
      "Logistics accounts for 24% of hiring signals in the last 14 days — double what it was a month ago.",
    tactical_implication: "A growing sales team usually means newly approved budget behind it.",
    confidence: 0.68,
    evidence_count: 14,
    is_active: true,
    expires_at: null,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: "demo-insight-3",
    insight_type: "competitive_cluster",
    signal_type: "tech_adoption",
    industry: null,
    title: "AI stack adoption clustered in 3 verticals",
    description:
      "AI-related tech_adoption signals cluster in Digital Health, EdTech, and Fintech — not evenly spread.",
    tactical_implication: "Positioning should vary by vertical instead of using one generic message.",
    confidence: 0.59,
    evidence_count: 11,
    is_active: true,
    expires_at: null,
    created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
  },
];

export function demoGetMarketInsights(): MarketInsight[] {
  return getDemoLocale() === "en" ? SEED_MARKET_INSIGHTS_EN : SEED_MARKET_INSIGHTS_ES;
}

// ── AccountResearchAgent — Account Brief ────────────────────────────────────
// Persisted per company (localStorage), same "nothing until you ask for it"
// posture as the real on-demand agent — no company starts pre-researched.
// The synthesized brief below is templated from the demo company's OWN
// already-known fields (industry/size/country/description), not invented
// facts about it — same honesty rule the rest of the sandbox already
// follows for its (also fictional) seeded companies.

const ACCOUNT_BRIEFS_KEY = "bee_demo_account_briefs_v1";
const loadAccountBriefs = () => loadJSON<Record<string, AccountBrief>>(ACCOUNT_BRIEFS_KEY, {});

export function demoGetCompanyBrief(companyId: string): AccountBrief | null {
  return loadAccountBriefs()[companyId] ?? null;
}

export function demoResearchCompany(companyId: string, force: boolean): AccountResearchResult {
  const briefs = loadAccountBriefs();
  if (!force && briefs[companyId]) {
    return { brief: briefs[companyId], from_cache: true, budget_exceeded: false, disabled: false };
  }

  const company = demoFetchCompany(companyId);
  if (!company) return { brief: null, from_cache: false, budget_exceeded: false, disabled: false };

  const en = getDemoLocale() === "en";
  const parts = [company.industry, company.size ? `${company.size} employees` : null, company.country].filter(
    Boolean,
  );
  const brief: AccountBrief = {
    id: `demo-brief-${companyId}`,
    company_id: companyId,
    summary: en
      ? `${company.name} is a ${parts.join(", ")} company${company.domain ? ` (${company.domain})` : ""}. ${company.description ?? "No further public profile detail found."}`
      : `${company.name} es una empresa de ${parts.join(", ")}${company.domain ? ` (${company.domain})` : ""}. ${company.description ?? "No se encontraron más detalles públicos de perfil."}`,
    findings: en
      ? {
          company_profile: parts.join(" · ") || "Not enough public data to profile this account yet.",
          web_presence: company.domain
            ? `Public site at ${company.domain} — no structured tech-stack data available in this sandbox.`
            : "No public domain on file for this account.",
          hiring_signals: "No qualifying hiring signals in the lookback window.",
        }
      : {
          perfil_empresa: parts.join(" · ") || "Todavía no hay suficiente dato público para perfilar esta cuenta.",
          presencia_web: company.domain
            ? `Sitio público en ${company.domain} — sin datos estructurados de stack tecnológico en este sandbox.`
            : "Esta cuenta no tiene dominio público registrado.",
          senales_contratacion: "Sin señales de contratación calificadas en la ventana de búsqueda.",
        },
    sources: company.domain ? ["website", "hiring_signals"] : ["hiring_signals"],
    generated_by: "demo",
    model_used: null,
    created_at: new Date().toISOString(),
  };

  briefs[companyId] = brief;
  saveJSON(ACCOUNT_BRIEFS_KEY, briefs);
  return { brief, from_cache: false, budget_exceeded: false, disabled: false };
}

// ── Voz de marca — Correction Learning / Deep Learning panel ────────────────

const STYLE_PROFILE_KEY = "bee_demo_style_profile_v1";

const SEED_STYLE_PROFILE_ES: StyleProfileOut = {
  total_corrections: 4,
  authoritative_rules_count: 2,
  style_summary:
    "Prefiere frases cortas (menos de 20 palabras), evita saludos genéricos como 'espero que estés bien', y cierra siempre con una pregunta directa de agenda.",
  profile_version: 3,
  last_correction_at: new Date(Date.now() - 6 * 86400000).toISOString(),
  rules_by_type: {
    tone: { directo_sin_relleno: { weight: 0.9, count: 4, authoritative: true } },
    structure: {
      cierre_con_pregunta: { weight: 0.85, count: 3, authoritative: true },
      parrafos_cortos: { weight: 0.6, count: 2, authoritative: false },
    },
  },
};

// `rules_by_type`'s keys (directo_sin_relleno, cierre_con_pregunta,
// parrafos_cortos) are machine-ish rule identifiers, not prose — they're
// checked against literal string matches in demoRecordCorrection below, so
// they stay as-is in both locales, same as agent_type/decision_type
// elsewhere in this file.
const SEED_STYLE_PROFILE_EN: StyleProfileOut = {
  total_corrections: 4,
  authoritative_rules_count: 2,
  style_summary:
    "Prefers short sentences (under 20 words), avoids generic greetings like 'hope you're doing well', and always closes with a direct scheduling question.",
  profile_version: 3,
  last_correction_at: new Date(Date.now() - 6 * 86400000).toISOString(),
  rules_by_type: {
    tone: { directo_sin_relleno: { weight: 0.9, count: 4, authoritative: true } },
    structure: {
      cierre_con_pregunta: { weight: 0.85, count: 3, authoritative: true },
      parrafos_cortos: { weight: 0.6, count: 2, authoritative: false },
    },
  },
};

function getSeedStyleProfile(locale: Locale): StyleProfileOut {
  return locale === "en" ? SEED_STYLE_PROFILE_EN : SEED_STYLE_PROFILE_ES;
}

const loadStyleProfile = () => loadJSON<StyleProfileOut>(STYLE_PROFILE_KEY, getSeedStyleProfile(getDemoLocale()));

export function demoFetchStyleProfile(): StyleProfileOut {
  return loadStyleProfile();
}

export function demoRecordCorrection(data: {
  original_content: string;
  edited_content: string;
  artifact_type: string;
}): CorrectionOut {
  const profile = loadStyleProfile();
  const rules: string[] = [];
  if (data.edited_content.length < data.original_content.length) rules.push("frases_mas_cortas");
  if (data.edited_content.includes("?") && !data.original_content.includes("?")) rules.push("cierre_con_pregunta");
  if (rules.length === 0) rules.push("tono_mas_directo");

  const changeRatio = Math.min(
    0.9,
    Math.max(0.05, Math.abs(data.edited_content.length - data.original_content.length) / Math.max(data.original_content.length, 1)),
  );

  const updatedProfile: StyleProfileOut = {
    ...profile,
    total_corrections: profile.total_corrections + 1,
    profile_version: profile.profile_version + 1,
    last_correction_at: new Date().toISOString(),
  };
  saveJSON(STYLE_PROFILE_KEY, updatedProfile);

  return {
    correction_id: `demo-correction-${Date.now()}`,
    artifact_type: data.artifact_type,
    diff_ops: [
      {
        type: "replace",
        content: data.edited_content.slice(0, 120),
        detail: "Reescritura aplicada a partir de tu edición",
        ratio: changeRatio,
      },
    ],
    extracted_rules: rules,
    change_ratio: Math.round(changeRatio * 100) / 100,
    style_summary: updatedProfile.style_summary,
    authoritative_rules_count: updatedProfile.authoritative_rules_count,
    total_corrections: updatedProfile.total_corrections,
    profile_version: updatedProfile.profile_version,
  };
}

const DEEP_ANOMALIES_KEY = "bee_demo_deep_anomalies_v1";

const SEED_DEEP_ANOMALIES_ES: ExtendedAnomalyAlert[] = [
  {
    id: "demo-deep-anomaly-1",
    alert_type: "conversion_drop",
    severity: "high",
    status: "open",
    segment_type: "channel",
    segment_value: "email",
    rolling_rate: 0.09,
    baseline_rate: 0.17,
    deviation_pct: -47.1,
    sample_size: 48,
    title: "Caída de conversión en email — Retail",
    description:
      "La tasa de respuesta en la secuencia de email para el sector Retail cayó 47% respecto a su línea base de las últimas 6 semanas.",
    recommendation: "Pausa la variante actual y prueba el asunto alternativo validado en Manufactura antes de escalar el volumen.",
    suggested_actions: [
      "Pausar la secuencia activa en Retail",
      "Correr un test A/B de asunto",
      "Revisar el CTA contra Fintech, que sigue estable",
    ],
    pending_action_id: null,
    acknowledged_at: null,
    resolution_notes: null,
    auto_resolved: false,
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: "demo-deep-anomaly-2",
    alert_type: "conversion_drop",
    severity: "medium",
    status: "open",
    segment_type: "sector",
    segment_value: "LegalTech",
    rolling_rate: 0.21,
    baseline_rate: 0.28,
    deviation_pct: -25.0,
    sample_size: 22,
    title: "Conversión por debajo de línea base — LegalTech",
    description: "El sector LegalTech muestra una tasa de conversión 25% por debajo de su promedio histórico en las últimas 2 semanas.",
    recommendation: "Sigue observando — la muestra todavía es pequeña (22 oportunidades) para actuar con confianza alta.",
    suggested_actions: ["Esperar a que la muestra crezca antes de cambiar de playbook"],
    pending_action_id: null,
    acknowledged_at: null,
    resolution_notes: null,
    auto_resolved: false,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];

const SEED_DEEP_ANOMALIES_EN: ExtendedAnomalyAlert[] = [
  {
    id: "demo-deep-anomaly-1",
    alert_type: "conversion_drop",
    severity: "high",
    status: "open",
    segment_type: "channel",
    segment_value: "email",
    rolling_rate: 0.09,
    baseline_rate: 0.17,
    deviation_pct: -47.1,
    sample_size: 48,
    title: "Conversion drop in email — Retail",
    description:
      "The response rate for the Retail email sequence dropped 47% against its 6-week baseline.",
    recommendation: "Pause the current variant and test the alternate subject line validated in Manufacturing before scaling volume.",
    suggested_actions: [
      "Pause the active sequence in Retail",
      "Run an A/B test on the subject line",
      "Review the CTA against Fintech, which remains stable",
    ],
    pending_action_id: null,
    acknowledged_at: null,
    resolution_notes: null,
    auto_resolved: false,
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: "demo-deep-anomaly-2",
    alert_type: "conversion_drop",
    severity: "medium",
    status: "open",
    segment_type: "sector",
    segment_value: "LegalTech",
    rolling_rate: 0.21,
    baseline_rate: 0.28,
    deviation_pct: -25.0,
    sample_size: 22,
    title: "Conversion below baseline — LegalTech",
    description: "The LegalTech sector is showing a conversion rate 25% below its historical average over the past 2 weeks.",
    recommendation: "Keep monitoring — the sample is still too small (22 opportunities) to act on with high confidence.",
    suggested_actions: ["Wait for the sample to grow before changing playbooks"],
    pending_action_id: null,
    acknowledged_at: null,
    resolution_notes: null,
    auto_resolved: false,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];

function getSeedDeepAnomalies(locale: Locale): ExtendedAnomalyAlert[] {
  return locale === "en" ? SEED_DEEP_ANOMALIES_EN : SEED_DEEP_ANOMALIES_ES;
}

const loadDeepAnomalies = () => loadJSON<ExtendedAnomalyAlert[]>(DEEP_ANOMALIES_KEY, getSeedDeepAnomalies(getDemoLocale()));
const saveDeepAnomalies = (list: ExtendedAnomalyAlert[]) => saveJSON(DEEP_ANOMALIES_KEY, list);

export function demoFetchAnomalyAlerts(params?: { status?: string; severity?: string }): ExtendedAnomalyAlert[] {
  let list = loadDeepAnomalies();
  if (params?.status) list = list.filter((a) => a.status === params.status);
  if (params?.severity) list = list.filter((a) => a.severity === params.severity);
  return list;
}

/** No new anomalies fabricated on demand — an honest "nothing new" scan,
 * same restraint as demoCheckAnomalies' sibling functions across the demo. */
export function demoCheckAnomalies(): AnomalyCheckResult {
  const locale = getDemoLocale();
  const open = loadDeepAnomalies().filter((a) => a.status === "open");
  const summary =
    locale === "en"
      ? `No new anomalies — ${open.length} alert${open.length === 1 ? "" : "s"} open under monitoring.`
      : `Sin nuevas anomalías — ${open.length} alerta${open.length === 1 ? "" : "s"} abierta${open.length === 1 ? "" : "s"} bajo monitoreo.`;
  return {
    checked_at: new Date().toISOString(),
    new_alerts: [],
    resolved_alerts: [],
    open_alerts: open,
    summary,
    checked_segments: 12,
  };
}

/** Control's AnomaliesPanel uses a smaller subset of AnomalyAlert's fields
 * (lib/api/anomalies.ts) than Voz de marca's DeepLearningPanel does — same
 * underlying AnomalyDetector service, two different views of it. Derived
 * from the same seed data rather than a second, separately-maintained
 * dataset, so the two panels can never show contradictory anomalies. */
export function demoFetchOpenAnomalies(): Array<{
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
}> {
  return loadDeepAnomalies()
    .filter((a) => a.status === "open")
    .map((a) => ({
      id: a.id,
      alert_type: a.alert_type,
      severity: a.severity,
      status: a.status,
      segment_type: a.segment_type,
      segment_value: a.segment_value,
      rolling_rate: a.rolling_rate,
      baseline_rate: a.baseline_rate,
      deviation_pct: a.deviation_pct,
      title: a.title,
      description: a.description,
      recommendation: a.recommendation,
    }));
}

export function demoAcknowledgeAnomaly(alertId: string, notes?: string): ExtendedAnomalyAlert {
  const list = loadDeepAnomalies();
  const idx = list.findIndex((a) => a.id === alertId);
  if (idx === -1) {
    throw new Error(`Demo anomaly ${alertId} not found — it only exists in this browser's local demo data.`);
  }
  list[idx] = {
    ...list[idx],
    status: "acknowledged",
    acknowledged_at: new Date().toISOString(),
    resolution_notes: notes ?? list[idx].resolution_notes,
  };
  saveDeepAnomalies(list);
  return list[idx];
}

// ── Resiliencia — Dead Letter Queue ──────────────────────────────────────────

const DLQ_KEY = "bee_demo_dlq_v1";

const SEED_DLQ_EVENTS_ES: FailedEvent[] = [
  {
    id: "demo-dlq-1",
    event_type: "webhook_delivery",
    event_name: "Envío de secuencia — Nimbus Cloud Systems",
    opportunity_id: "demo-opp-s07",
    lead_id: null,
    pending_action_id: null,
    attempt_count: 2,
    last_error: "Timeout conectando con el proveedor de email (10s)",
    error_history: [
      { attempt: 1, error: "Timeout conectando con el proveedor de email (10s)", timestamp: new Date(Date.now() - 3 * 3600000).toISOString() },
      { attempt: 2, error: "Timeout conectando con el proveedor de email (10s)", timestamp: new Date(Date.now() - 1 * 3600000).toISOString() },
    ],
    status: "pending",
    next_retry_at: new Date(Date.now() + 15 * 60000).toISOString(),
    last_attempted_at: new Date(Date.now() - 1 * 3600000).toISOString(),
    resolved_at: null,
    resolution_notes: null,
    ceo_alerted: false,
    created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: "demo-dlq-2",
    event_type: "webhook_call",
    event_name: "Webhook saliente — CRM externo",
    opportunity_id: null,
    lead_id: null,
    pending_action_id: null,
    attempt_count: 5,
    last_error: "El endpoint del CRM devolvió 410 Gone",
    error_history: [
      { attempt: 1, error: "Connection refused", timestamp: new Date(Date.now() - 2 * 86400000).toISOString() },
      { attempt: 5, error: "El endpoint del CRM devolvió 410 Gone", timestamp: new Date(Date.now() - 1 * 86400000).toISOString() },
    ],
    status: "permanently_failed",
    next_retry_at: null,
    last_attempted_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    resolved_at: null,
    resolution_notes: null,
    ceo_alerted: true,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "demo-dlq-3",
    event_type: "slack_notify",
    event_name: "Notificación Slack — alerta de anomalía",
    opportunity_id: null,
    lead_id: null,
    pending_action_id: null,
    attempt_count: 2,
    last_error: null,
    error_history: [
      { attempt: 1, error: "El token del canal de Slack había expirado", timestamp: new Date(Date.now() - 5 * 86400000).toISOString() },
    ],
    status: "resolved",
    next_retry_at: null,
    last_attempted_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    resolved_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    resolution_notes: "Reintentado manualmente tras reconectar el canal de Slack.",
    ceo_alerted: false,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: "demo-dlq-4",
    event_type: "webhook_delivery",
    event_name: "Envío de secuencia — Cobre Insurtech",
    opportunity_id: "demo-opp-s16",
    lead_id: null,
    pending_action_id: null,
    attempt_count: 1,
    last_error: "Rate limit del proveedor de LinkedIn alcanzado",
    error_history: [
      { attempt: 1, error: "Rate limit del proveedor de LinkedIn alcanzado", timestamp: new Date(Date.now() - 20 * 60000).toISOString() },
    ],
    status: "retrying",
    next_retry_at: new Date(Date.now() + 40 * 60000).toISOString(),
    last_attempted_at: new Date(Date.now() - 20 * 60000).toISOString(),
    resolved_at: null,
    resolution_notes: null,
    ceo_alerted: false,
    created_at: new Date(Date.now() - 20 * 60000).toISOString(),
  },
];

const SEED_DLQ_EVENTS_EN: FailedEvent[] = [
  {
    id: "demo-dlq-1",
    event_type: "webhook_delivery",
    event_name: "Sequence send — Nimbus Cloud Systems",
    opportunity_id: "demo-opp-s07",
    lead_id: null,
    pending_action_id: null,
    attempt_count: 2,
    last_error: "Timed out connecting to the email provider (10s)",
    error_history: [
      { attempt: 1, error: "Timed out connecting to the email provider (10s)", timestamp: new Date(Date.now() - 3 * 3600000).toISOString() },
      { attempt: 2, error: "Timed out connecting to the email provider (10s)", timestamp: new Date(Date.now() - 1 * 3600000).toISOString() },
    ],
    status: "pending",
    next_retry_at: new Date(Date.now() + 15 * 60000).toISOString(),
    last_attempted_at: new Date(Date.now() - 1 * 3600000).toISOString(),
    resolved_at: null,
    resolution_notes: null,
    ceo_alerted: false,
    created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: "demo-dlq-2",
    event_type: "webhook_call",
    event_name: "Outbound webhook — external CRM",
    opportunity_id: null,
    lead_id: null,
    pending_action_id: null,
    attempt_count: 5,
    last_error: "The CRM endpoint returned 410 Gone",
    error_history: [
      { attempt: 1, error: "Connection refused", timestamp: new Date(Date.now() - 2 * 86400000).toISOString() },
      { attempt: 5, error: "The CRM endpoint returned 410 Gone", timestamp: new Date(Date.now() - 1 * 86400000).toISOString() },
    ],
    status: "permanently_failed",
    next_retry_at: null,
    last_attempted_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    resolved_at: null,
    resolution_notes: null,
    ceo_alerted: true,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "demo-dlq-3",
    event_type: "slack_notify",
    event_name: "Slack notification — anomaly alert",
    opportunity_id: null,
    lead_id: null,
    pending_action_id: null,
    attempt_count: 2,
    last_error: null,
    error_history: [
      { attempt: 1, error: "The Slack channel token had expired", timestamp: new Date(Date.now() - 5 * 86400000).toISOString() },
    ],
    status: "resolved",
    next_retry_at: null,
    last_attempted_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    resolved_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    resolution_notes: "Manually retried after reconnecting the Slack channel.",
    ceo_alerted: false,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: "demo-dlq-4",
    event_type: "webhook_delivery",
    event_name: "Sequence send — Cobre Insurtech",
    opportunity_id: "demo-opp-s16",
    lead_id: null,
    pending_action_id: null,
    attempt_count: 1,
    last_error: "LinkedIn provider rate limit reached",
    error_history: [
      { attempt: 1, error: "LinkedIn provider rate limit reached", timestamp: new Date(Date.now() - 20 * 60000).toISOString() },
    ],
    status: "retrying",
    next_retry_at: new Date(Date.now() + 40 * 60000).toISOString(),
    last_attempted_at: new Date(Date.now() - 20 * 60000).toISOString(),
    resolved_at: null,
    resolution_notes: null,
    ceo_alerted: false,
    created_at: new Date(Date.now() - 20 * 60000).toISOString(),
  },
];

function getSeedDLQEvents(locale: Locale): FailedEvent[] {
  return locale === "en" ? SEED_DLQ_EVENTS_EN : SEED_DLQ_EVENTS_ES;
}

const loadDLQ = () => loadJSON<FailedEvent[]>(DLQ_KEY, getSeedDLQEvents(getDemoLocale()));
const saveDLQ = (list: FailedEvent[]) => saveJSON(DLQ_KEY, list);

export function demoFetchDLQEvents(params?: { status?: string; limit?: number }): FailedEvent[] {
  let list = loadDLQ();
  if (params?.status) list = list.filter((e) => e.status === params.status);
  return params?.limit ? list.slice(0, params.limit) : list;
}

export function demoDLQSummary(): DLQSummary {
  const all = loadDLQ();
  const now = Date.now();
  return {
    total_events: all.length,
    pending_count: all.filter((e) => e.status === "pending").length,
    retrying_count: all.filter((e) => e.status === "retrying").length,
    resolved_count: all.filter((e) => e.status === "resolved").length,
    permanently_failed_count: all.filter((e) => e.status === "permanently_failed").length,
    due_for_retry_count: all.filter(
      (e) => (e.status === "pending" || e.status === "retrying") && e.next_retry_at && new Date(e.next_retry_at).getTime() <= now,
    ).length,
    ceo_alerted_count: all.filter((e) => e.ceo_alerted).length,
  };
}

function findDLQOrThrow(list: FailedEvent[], id: string): number {
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) {
    throw new Error(`Demo DLQ event ${id} not found — it only exists in this browser's local demo data.`);
  }
  return idx;
}

/** Simulated retry always succeeds — same honesty tradeoff as
 * demoRecordOutcome: this is a local record of "this got retried," not a
 * dice roll standing in for real infrastructure. */
export function demoRetryDLQEvent(eventId: string): DLQRetryResult {
  const locale = getDemoLocale();
  const list = loadDLQ();
  const idx = findDLQOrThrow(list, eventId);
  const now = new Date().toISOString();
  list[idx] = {
    ...list[idx],
    attempt_count: list[idx].attempt_count + 1,
    status: "resolved",
    resolved_at: now,
    last_attempted_at: now,
    next_retry_at: null,
  };
  saveDLQ(list);
  return {
    event_id: eventId,
    success: true,
    status: "resolved",
    message: locale === "en" ? "Retry succeeded — the event was resolved." : "Reintento exitoso — el evento se resolvió.",
    attempt_count: list[idx].attempt_count,
    next_retry_at: null,
  };
}

export function demoResolveDLQEvent(eventId: string, notes?: string): FailedEvent {
  const locale = getDemoLocale();
  const list = loadDLQ();
  const idx = findDLQOrThrow(list, eventId);
  list[idx] = {
    ...list[idx],
    status: "resolved",
    resolved_at: new Date().toISOString(),
    resolution_notes: notes ?? (locale === "en" ? "Resolved manually from the panel." : "Resuelto manualmente desde el panel."),
  };
  saveDLQ(list);
  return list[idx];
}

// ── Resiliencia — Audit Trail ────────────────────────────────────────────────

const AUDIT_KEY = "bee_demo_audit_v1";

// Only `strategy_reasoning` is narrative text — context_snapshot/
// market_data_used/output_snapshot carry structured, machine-shaped data
// (mirroring what the real AuditTrail stores) and stay identical across
// locales, same as agent_type/decision_type/generator_name.
const SEED_AUDIT_ENTRIES_ES: AuditEntry[] = [
  {
    id: "demo-audit-1",
    agent_type: "strategy_generator",
    decision_type: "strategy_generation",
    session_id: null,
    opportunity_id: "demo-opp-s07",
    lead_id: null,
    signal_id: "demo-signal-s07",
    pending_action_id: null,
    context_snapshot: { signal_type: "product_launch", industry: "Infraestructura cloud" },
    market_data_used: { top_playbook: "product_launch_technical", historical_win_rate: 0.42 },
    strategy_reasoning: "Señal de lanzamiento de producto con alto encaje técnico — se prioriza el playbook de evaluación técnica.",
    output_snapshot: { pain_point: "Escalar sin visibilidad de infraestructura", generator: "rule_based" },
    confidence_score: 0.88,
    manual_review_required: false,
    processing_ms: 420,
    generator_name: "HiringStrategyGenerator",
    generator_version: "2.3",
    created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
  },
  {
    id: "demo-audit-2",
    agent_type: "psychographic_analyzer",
    decision_type: "disc_classification",
    session_id: null,
    opportunity_id: "demo-opp-s04",
    lead_id: null,
    signal_id: null,
    pending_action_id: null,
    context_snapshot: { title: "Head of Sales", seniority: "director" },
    market_data_used: {},
    strategy_reasoning: "Lenguaje directo y orientado a resultados en las últimas interacciones — clasificado como perfil D dominante.",
    output_snapshot: { dominant_style: "D", confidence: 0.61 },
    confidence_score: 0.61,
    manual_review_required: true,
    processing_ms: 180,
    generator_name: "PsychographicAnalyzer",
    generator_version: "1.4",
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: "demo-audit-3",
    agent_type: "dark_funnel",
    decision_type: "hot_lead_scoring",
    session_id: null,
    opportunity_id: null,
    lead_id: null,
    signal_id: null,
    pending_action_id: null,
    context_snapshot: { company_domain: "nimbuscloud.io", signal_count: 4 },
    market_data_used: { research_intensity_score: 0.83 },
    strategy_reasoning: "Actividad de investigación sostenida en páginas de precios y comparativas — etapa de compra: listo para comprar.",
    output_snapshot: { buying_stage: "ready_to_buy", is_hot: true },
    confidence_score: 0.91,
    manual_review_required: false,
    processing_ms: 95,
    generator_name: "DarkFunnelService",
    generator_version: "1.1",
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: "demo-audit-4",
    agent_type: "agent_orchestrator",
    decision_type: "action_approval_gate",
    session_id: null,
    opportunity_id: "demo-opp-s16",
    lead_id: null,
    signal_id: null,
    pending_action_id: null,
    context_snapshot: { action_type: "send_email" },
    market_data_used: {},
    strategy_reasoning: "Correo de apertura generado — enviado a la cola de aprobación del CEO antes de despachar.",
    output_snapshot: { queued: true },
    confidence_score: 0.74,
    manual_review_required: false,
    processing_ms: 60,
    generator_name: "AgentOrchestrator",
    generator_version: "1.0",
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "demo-audit-5",
    agent_type: "executive_agent",
    decision_type: "battlecard_creation",
    session_id: null,
    opportunity_id: "demo-opp-s10",
    lead_id: null,
    signal_id: null,
    pending_action_id: null,
    context_snapshot: { signal_type: "expansion", industry: "Comercio exterior" },
    market_data_used: { top_channel: "linkedin" },
    strategy_reasoning: "Batalla generada a partir de la señal de expansión — argumento de cierre basado en el ciclo de venta promedio del sector.",
    output_snapshot: { closing_argument: "Reduce tu ciclo de decisión 30%", generator: "rule_based" },
    confidence_score: 0.7,
    manual_review_required: false,
    processing_ms: 510,
    generator_name: "ExecutiveAgent",
    generator_version: "2.0",
    created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
  },
  {
    id: "demo-audit-6",
    agent_type: "trend_analyst",
    decision_type: "market_insight_generation",
    session_id: null,
    opportunity_id: null,
    lead_id: null,
    signal_id: null,
    pending_action_id: null,
    context_snapshot: { signal_type: "funding_round" },
    market_data_used: { evidence_count: 9 },
    strategy_reasoning: "Aumento sostenido de señales de financiamiento en Fintech durante las últimas 3 semanas.",
    output_snapshot: { insight_type: "sector_momentum" },
    confidence_score: 0.48,
    manual_review_required: true,
    processing_ms: 340,
    generator_name: "TrendAnalyst",
    generator_version: "1.2",
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

const SEED_AUDIT_ENTRIES_EN: AuditEntry[] = [
  {
    id: "demo-audit-1",
    agent_type: "strategy_generator",
    decision_type: "strategy_generation",
    session_id: null,
    opportunity_id: "demo-opp-s07",
    lead_id: null,
    signal_id: "demo-signal-s07",
    pending_action_id: null,
    context_snapshot: { signal_type: "product_launch", industry: "Infraestructura cloud" },
    market_data_used: { top_playbook: "product_launch_technical", historical_win_rate: 0.42 },
    strategy_reasoning: "Product-launch signal with strong technical fit — prioritizing the technical-evaluation playbook.",
    output_snapshot: { pain_point: "Escalar sin visibilidad de infraestructura", generator: "rule_based" },
    confidence_score: 0.88,
    manual_review_required: false,
    processing_ms: 420,
    generator_name: "HiringStrategyGenerator",
    generator_version: "2.3",
    created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
  },
  {
    id: "demo-audit-2",
    agent_type: "psychographic_analyzer",
    decision_type: "disc_classification",
    session_id: null,
    opportunity_id: "demo-opp-s04",
    lead_id: null,
    signal_id: null,
    pending_action_id: null,
    context_snapshot: { title: "Head of Sales", seniority: "director" },
    market_data_used: {},
    strategy_reasoning: "Direct, results-oriented language in recent interactions — classified as a dominant D profile.",
    output_snapshot: { dominant_style: "D", confidence: 0.61 },
    confidence_score: 0.61,
    manual_review_required: true,
    processing_ms: 180,
    generator_name: "PsychographicAnalyzer",
    generator_version: "1.4",
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: "demo-audit-3",
    agent_type: "dark_funnel",
    decision_type: "hot_lead_scoring",
    session_id: null,
    opportunity_id: null,
    lead_id: null,
    signal_id: null,
    pending_action_id: null,
    context_snapshot: { company_domain: "nimbuscloud.io", signal_count: 4 },
    market_data_used: { research_intensity_score: 0.83 },
    strategy_reasoning: "Sustained research activity on pricing and comparison pages — buying stage: ready to buy.",
    output_snapshot: { buying_stage: "ready_to_buy", is_hot: true },
    confidence_score: 0.91,
    manual_review_required: false,
    processing_ms: 95,
    generator_name: "DarkFunnelService",
    generator_version: "1.1",
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: "demo-audit-4",
    agent_type: "agent_orchestrator",
    decision_type: "action_approval_gate",
    session_id: null,
    opportunity_id: "demo-opp-s16",
    lead_id: null,
    signal_id: null,
    pending_action_id: null,
    context_snapshot: { action_type: "send_email" },
    market_data_used: {},
    strategy_reasoning: "Opening email generated — sent to the CEO's approval queue before dispatch.",
    output_snapshot: { queued: true },
    confidence_score: 0.74,
    manual_review_required: false,
    processing_ms: 60,
    generator_name: "AgentOrchestrator",
    generator_version: "1.0",
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "demo-audit-5",
    agent_type: "executive_agent",
    decision_type: "battlecard_creation",
    session_id: null,
    opportunity_id: "demo-opp-s10",
    lead_id: null,
    signal_id: null,
    pending_action_id: null,
    context_snapshot: { signal_type: "expansion", industry: "Comercio exterior" },
    market_data_used: { top_channel: "linkedin" },
    strategy_reasoning: "Battlecard generated from the expansion signal — closing argument based on the sector's average sales cycle.",
    output_snapshot: { closing_argument: "Reduce tu ciclo de decisión 30%", generator: "rule_based" },
    confidence_score: 0.7,
    manual_review_required: false,
    processing_ms: 510,
    generator_name: "ExecutiveAgent",
    generator_version: "2.0",
    created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
  },
  {
    id: "demo-audit-6",
    agent_type: "trend_analyst",
    decision_type: "market_insight_generation",
    session_id: null,
    opportunity_id: null,
    lead_id: null,
    signal_id: null,
    pending_action_id: null,
    context_snapshot: { signal_type: "funding_round" },
    market_data_used: { evidence_count: 9 },
    strategy_reasoning: "Sustained increase in funding-round signals in Fintech over the past 3 weeks.",
    output_snapshot: { insight_type: "sector_momentum" },
    confidence_score: 0.48,
    manual_review_required: true,
    processing_ms: 340,
    generator_name: "TrendAnalyst",
    generator_version: "1.2",
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

function getSeedAuditEntries(locale: Locale): AuditEntry[] {
  return locale === "en" ? SEED_AUDIT_ENTRIES_EN : SEED_AUDIT_ENTRIES_ES;
}

const loadAudit = () => loadJSON<AuditEntry[]>(AUDIT_KEY, getSeedAuditEntries(getDemoLocale()));

export function demoFetchAuditDecisions(params?: {
  agent_type?: string;
  manual_review_required?: boolean;
  opportunity_id?: string;
  limit?: number;
}): AuditEntry[] {
  let list = loadAudit();
  if (params?.agent_type) list = list.filter((e) => e.agent_type === params.agent_type);
  if (params?.manual_review_required !== undefined) {
    list = list.filter((e) => e.manual_review_required === params.manual_review_required);
  }
  if (params?.opportunity_id) list = list.filter((e) => e.opportunity_id === params.opportunity_id);
  return params?.limit ? list.slice(0, params.limit) : list;
}

export function demoAuditSummary(): AuditSummary {
  const all = loadAudit();
  const byAgent: Record<string, number> = {};
  const byDecision: Record<string, number> = {};
  for (const entry of all) {
    byAgent[entry.agent_type] = (byAgent[entry.agent_type] ?? 0) + 1;
    byDecision[entry.decision_type] = (byDecision[entry.decision_type] ?? 0) + 1;
  }
  return {
    total_entries: all.length,
    manual_review_count: all.filter((e) => e.manual_review_required).length,
    avg_confidence_score:
      all.length === 0 ? 0 : Math.round((all.reduce((sum, e) => sum + e.confidence_score, 0) / all.length) * 100) / 100,
    entries_by_agent: byAgent,
    entries_by_decision: byDecision,
  };
}

// ── Resiliencia — AgentOrchestrator approval queue ──────────────────────────

const PENDING_ACTIONS_KEY = "bee_demo_pending_actions_v1";

const SEED_PENDING_ACTIONS_ES: PendingAction[] = [
  {
    id: "demo-pending-1",
    opportunity_id: "demo-opp-s07",
    action_type: "send_email",
    status: "pending_approval",
    title: "Enviar apertura — Nimbus Cloud Systems",
    description: "Correo de primer contacto generado a partir de la señal de lanzamiento de producto.",
    preview:
      "Asunto: Escalar infraestructura sin perder visibilidad\n\nHola Ashley,\n\nVi el lanzamiento de la nueva plataforma de Nimbus — felicidades. Muchos equipos en etapas similares terminan sacrificando visibilidad operativa al escalar tan rápido...",
    payload: { channel: "email" },
    priority: 1,
    retry_count: 0,
    approved_by: null,
    approved_at: null,
    completed_at: null,
    failure_reason: null,
    expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: "demo-pending-2",
    opportunity_id: "demo-opp-s16",
    action_type: "linkedin_message",
    status: "pending_approval",
    title: "Solicitud de conexión — Cobre Insurtech",
    description: "Segundo paso de la secuencia de financiamiento: solicitud de conexión en LinkedIn.",
    preview: "Hola Andrés, felicidades por la ronda reciente de Cobre Insurtech — me encantaría conectar y compartir cómo...",
    payload: { channel: "linkedin" },
    priority: 2,
    retry_count: 0,
    approved_by: null,
    approved_at: null,
    completed_at: null,
    failure_reason: null,
    expires_at: new Date(Date.now() + 4 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 26 * 3600000).toISOString(),
  },
  {
    id: "demo-pending-3",
    opportunity_id: "demo-opp-s10",
    action_type: "crm_update",
    status: "completed",
    title: "Registrar avance de etapa — Puerto Digital",
    description: "Actualización automática de etapa tras respuesta positiva.",
    preview: null,
    payload: { field: "status", value: "in_progress" },
    priority: 3,
    retry_count: 0,
    approved_by: "CEO",
    approved_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    completed_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    failure_reason: null,
    expires_at: null,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
];

const SEED_PENDING_ACTIONS_EN: PendingAction[] = [
  {
    id: "demo-pending-1",
    opportunity_id: "demo-opp-s07",
    action_type: "send_email",
    status: "pending_approval",
    title: "Send opening — Nimbus Cloud Systems",
    description: "First-contact email generated from the product-launch signal.",
    preview:
      "Subject: Scale infrastructure without losing visibility\n\nHi Ashley,\n\nSaw the launch of Nimbus's new platform — congrats. Many teams at a similar stage end up sacrificing operational visibility when scaling this fast...",
    payload: { channel: "email" },
    priority: 1,
    retry_count: 0,
    approved_by: null,
    approved_at: null,
    completed_at: null,
    failure_reason: null,
    expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: "demo-pending-2",
    opportunity_id: "demo-opp-s16",
    action_type: "linkedin_message",
    status: "pending_approval",
    title: "Connection request — Cobre Insurtech",
    description: "Second step of the funding sequence: LinkedIn connection request.",
    preview: "Hi Andrés, congrats on Cobre Insurtech's recent round — I'd love to connect and share how...",
    payload: { channel: "linkedin" },
    priority: 2,
    retry_count: 0,
    approved_by: null,
    approved_at: null,
    completed_at: null,
    failure_reason: null,
    expires_at: new Date(Date.now() + 4 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 26 * 3600000).toISOString(),
  },
  {
    id: "demo-pending-3",
    opportunity_id: "demo-opp-s10",
    action_type: "crm_update",
    status: "completed",
    title: "Log stage progress — Puerto Digital",
    description: "Automatic stage update after a positive response.",
    preview: null,
    payload: { field: "status", value: "in_progress" },
    priority: 3,
    retry_count: 0,
    approved_by: "CEO",
    approved_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    completed_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    failure_reason: null,
    expires_at: null,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
];

function getSeedPendingActions(locale: Locale): PendingAction[] {
  return locale === "en" ? SEED_PENDING_ACTIONS_EN : SEED_PENDING_ACTIONS_ES;
}

const loadPendingActions = () => loadJSON<PendingAction[]>(PENDING_ACTIONS_KEY, getSeedPendingActions(getDemoLocale()));
const savePendingActions = (list: PendingAction[]) => saveJSON(PENDING_ACTIONS_KEY, list);

export function demoFetchPendingActions(limit = 50): PendingAction[] {
  return loadPendingActions().slice(0, limit);
}

function findPendingActionOrThrow(list: PendingAction[], id: string): number {
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) {
    throw new Error(`Demo pending action ${id} not found — it only exists in this browser's local demo data.`);
  }
  return idx;
}

export function demoApproveAction(actionId: string, approvedBy: string): PendingAction {
  const list = loadPendingActions();
  const idx = findPendingActionOrThrow(list, actionId);
  list[idx] = {
    ...list[idx],
    status: "approved",
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  savePendingActions(list);
  return list[idx];
}

export function demoRejectAction(actionId: string, reason?: string): PendingAction {
  const list = loadPendingActions();
  const idx = findPendingActionOrThrow(list, actionId);
  list[idx] = {
    ...list[idx],
    status: "rejected",
    failure_reason: reason ?? null,
    updated_at: new Date().toISOString(),
  };
  savePendingActions(list);
  return list[idx];
}
