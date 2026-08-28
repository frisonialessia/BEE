/**
 * Local-only data store backing `/probar` — see `lib/demo/mode.ts` for why
 * this exists. Everything here lives in the visitor's own browser
 * (`localStorage`) and is seeded from `lib/sample-data`'s existing,
 * realistic example dataset. Nothing here ever calls the real API.
 */
import type { CrmStage, OpportunityUpdateIn } from "@/lib/api/opportunities";
import { sampleOpportunities } from "@/lib/sample-data";
import type { Opportunity, OpportunityStatus, OutcomeIn } from "@/types/domain";
import type { OutcomeWithPrediction } from "@/types/extended";

const STORAGE_KEY = "bee_demo_opportunities_v1";

function load(): Opportunity[] {
  if (typeof window === "undefined") return structuredClone(sampleOpportunities);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Opportunity[];
  } catch {
    // Corrupted JSON or storage unavailable (private browsing, quota) —
    // reseed rather than crash the demo.
  }
  const seeded = structuredClone(sampleOpportunities);
  save(seeded);
  return seeded;
}

function save(list: Opportunity[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable — the demo just won't persist across
    // reloads for this visitor. Not worth surfacing as an error.
  }
}

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

/** Wipes this visitor's local edits and restores the original seed data. */
export function resetDemoData(): void {
  save(structuredClone(sampleOpportunities));
}
