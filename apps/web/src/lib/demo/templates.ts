/**
 * Generates a Signal → Opportunity (→ Battlecard + Artifacts) set for a
 * company the /probar visitor names themselves — see
 * `demoAddCompany` in `lib/demo/store.ts`.
 *
 * Deliberately does NOT fabricate an event about their real company (no
 * fake "raised a Series B" for a company that didn't) — that would be
 * exactly the kind of invented metric this product's honesty policy
 * exists to rule out. Instead it frames the one thing that's always true
 * in this exact moment: they're evaluating a sales intelligence tool right
 * now, which is itself a real, first-party intent signal — the same kind
 * BEE would actually flag from a website visit or pricing-page view.
 */
import type {
  ArtifactBundle,
  Battlecard,
  Opportunity,
  Signal,
  SignalType,
} from "@/types/domain";
import type { EmployeeRange } from "@/lib/api/organizations";

const PAIN_BY_SIZE: Record<EmployeeRange, string> = {
  "1-10": "Con un equipo tan chico, cada hora en prospección manual es una hora que no vuelve — no hay margen para señales que se pierden.",
  "11-50": "En esta etapa el pipeline crece más rápido que la capacidad de investigar cada cuenta a mano — las señales importantes se mezclan con ruido.",
  "51-200": "Con varios reps trabajando en paralelo, sin un sistema central de señales cada uno prioriza distinto — se pierde consistencia en el approach.",
  "201-500": "A esta escala, coordinar qué cuenta atacar primero entre varios equipos sin datos centralizados es prácticamente imposible a mano.",
  "501-1000": "Con esta cantidad de cuentas en juego, el costo de no priorizar bien es directo: presupuesto de outbound gastado en las cuentas equivocadas.",
  "1000+": "A escala enterprise, la señal correcta puede estar en cualquiera de miles de cuentas — sin un motor que la detecte, se pierde en el ruido.",
};

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface DemoCompanySet {
  signal: Signal;
  opportunity: Opportunity;
  battlecard: Battlecard;
  artifacts: ArtifactBundle;
}

export function buildDemoCompanySet(companyName: string, employeeRange: EmployeeRange): DemoCompanySet {
  const now = new Date().toISOString();
  const signalId = randomId();
  const opportunityId = randomId();
  const pain = PAIN_BY_SIZE[employeeRange];
  const name = companyName.trim();

  const signal: Signal = {
    id: signalId,
    signal_type: "tech_adoption",
    source: "webhook",
    title: `${name} está evaluando herramientas de inteligencia comercial`,
    description: `Detectado ahora mismo, en este sandbox — el mismo tipo de señal de intención que BEE captura de una visita a pricing o una demo agendada.`,
    score: 81,
    confidence: 0.7,
    detected_at: now,
    company_id: null,
    lead_id: null,
    analysis: { tags: ["intent", "self_reported"], analyzers: ["generic_fallback"], primary_analyzer: "generic_fallback" },
  };

  const strategy = {
    pain_point: pain,
    closing_argument: `${name}, ya estás mirando cómo priorizar señales de mercado — el paso que sigue es dejar que un motor lo haga por ti, todo el tiempo, no solo hoy.`,
    timing_window: { urgency: "this_week" as const, reason: "Ventana de evaluación activa", expires_at: null },
    playbook: "self_serve_evaluation",
    next_best_action: "reach_out",
    channel: "email",
    generator: "rule_based",
    generator_version: "1.0.0",
    generated_at: now,
    rationale: `Señal de intención de primera parte: ${name} (${employeeRange} empleados) está probando BEE en este momento.`,
    confidence_score: 0.7,
    manual_review_required: false,
    variant_id: null,
    variant_arm: null,
  };

  const opportunity: Opportunity = {
    id: opportunityId,
    title: `Oportunidad: ${name} está evaluando BEE`,
    status: "detected",
    score: 81,
    strategy,
    signal_id: signalId,
    lead_id: null,
    company_id: null,
    assigned_to_user_id: null,
    amount: null,
    expected_close_date: null,
    qualification: {},
    created_at: now,
    updated_at: now,
    loss_reason: null,
    competitor: null,
    closed_at: null,
  };

  const battlecard: Battlecard = {
    opportunity_id: opportunityId,
    title: opportunity.title,
    status: "detected",
    score: 81,
    ready_to_action: false,
    hot_lead: false,
    manual_review_required: false,
    company: { name, domain: null, industry: null, country: null },
    lead: { full_name: null, title: null, email: null, seniority: null, linkedin_url: null },
    signal: {
      id: signalId,
      signal_type: signal.signal_type,
      title: signal.title,
      description: signal.description,
      score: signal.score,
      detected_at: signal.detected_at,
      tags: signal.analysis.tags ?? [],
    },
    strategy,
    created_at: now,
    updated_at: now,
  };

  const artifacts: ArtifactBundle = {
    opportunity_id: opportunityId,
    generated_at: now,
    generator: "rule_based_artifacts",
    email_draft: {
      artifact_type: "email_draft",
      subject: `${name} — probando BEE, esto es lo que armamos`,
      body: `Hola,\n\n${strategy.closing_argument}\n\nSi esto es útil, sigamos la conversación.\n\nSaludos,\n[Tu nombre]`,
      ps_line: null,
      recommended_send_time: "Martes–jueves, 8–10 AM hora local",
      estimated_read_time_seconds: 20,
    },
    meeting_structure: {
      artifact_type: "meeting_structure",
      meeting_title: `BEE × ${name} — Llamada de descubrimiento`,
      total_duration_minutes: 20,
      objective: `Entender si BEE encaja con el proceso comercial de ${name} y definir un próximo paso concreto.`,
      agenda_items: [
        { duration_minutes: 5, title: "Contexto y objetivos", notes: null },
        { duration_minutes: 10, title: "Cómo prioriza señales el equipo hoy", notes: pain },
        { duration_minutes: 5, title: "Próximos pasos", notes: null },
      ],
      pre_meeting_prep: [`Revisar el sitio de ${name}`, "Confirmar quién define el proceso comercial hoy"],
      success_criteria: "Se define un próximo paso claro dentro de la semana.",
    },
    next_steps: {
      artifact_type: "next_steps",
      horizon: "Próximos 7 días",
      actions: [
        { action: "Seguir explorando el pipeline en este sandbox", owner: "rep", timing: "ahora", priority: "medium" },
        { action: "Crear una cuenta real cuando quieras cargar tus propios datos", owner: "rep", timing: "cuando quieras", priority: "low" },
      ],
      key_risk: null,
      success_milestone: "Cuenta real creada.",
    },
    context_snapshot: {
      company: name,
      lead: null,
      signal_type: signal.signal_type,
      playbook: strategy.playbook,
      channel: strategy.channel,
    },
  };

  return { signal, opportunity, battlecard, artifacts };
}

// ── "+ Nueva oportunidad" (CRM) — the local counterpart to POST /opportunities ──
//
// Unlike buildDemoCompanySet above, this one IS about a prospect account,
// not the visitor's own — but it's the same honesty category, not a
// different one: the rep types in real information they already have (a
// company they know, a contact, and their own reason it's worth pursuing),
// same as they would in a real CRM. Nothing here invents an external
// triggering event; `description` is the rep's own words, carried through
// verbatim into the pain point, exactly like the real backend's
// `POST /opportunities` seeds `Signal.description` from it. The per-type
// framing below just mirrors the flavor of the real rule-based generators
// (see app/services/strategy_generator/rule_based.py) so a manually-added
// account gets an equally specific battlecard, not a generic placeholder.

/** Matches lib/demo/store.ts's `slugify` — company/lead identity in this
 * demo is a name-derived key, not a real row, and every producer of an
 * Opportunity's company_id/lead_id (seed-history.ts, store.ts, this file)
 * has to derive it the same way for Empresas/Leads/the company detail page
 * to actually find the right one. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || "demo";
}

interface SignalFlavor {
  opener: (company: string) => string;
  channel: string;
  playbook: string;
}

const SIGNAL_FLAVOR: Record<SignalType, SignalFlavor> = {
  funding_round: {
    opener: (c) => `${c} está en una ventana activa de asignación de presupuesto tras un evento de financiamiento reciente.`,
    channel: "email",
    playbook: "post_funding_outreach",
  },
  hiring: {
    opener: (c) => `${c} está en modo activo de contratación comercial — el equipo entrante necesita herramientas que escalen con el headcount.`,
    channel: "linkedin",
    playbook: "hiring_growth_outreach",
  },
  leadership_change: {
    opener: (c) => `${c} sumó liderazgo nuevo — la ventana de "hoja en blanco", sin lealtad a proveedores actuales, está abierta.`,
    channel: "linkedin",
    playbook: "leadership_change_outreach",
  },
  tech_adoption: {
    opener: (c) => `${c} está en modo cambio de stack — la receptividad a herramientas adyacentes suele estar en su punto más alto justo ahora.`,
    channel: "email",
    playbook: "complementary_tech_pitch",
  },
  product_launch: {
    opener: (c) => `${c} acaba de lanzar producto — es un momento de alta visibilidad interna para justificar nueva inversión comercial.`,
    channel: "email",
    playbook: "product_launch_outreach",
  },
  engagement: {
    opener: (c) => `${c} mostró intención directa (visita, descarga o interacción) — la señal más cercana a "listo para hablar" que existe.`,
    channel: "email",
    playbook: "warm_engagement_outreach",
  },
  news_mention: {
    opener: (c) => `${c} apareció en prensa recientemente — buen gancho de conversación con contexto fresco y verificable.`,
    channel: "email",
    playbook: "news_hook_outreach",
  },
  expansion: {
    opener: (c) => `${c} está expandiendo operaciones — una nueva oficina o mercado suele venir acompañada de nuevo presupuesto.`,
    channel: "email",
    playbook: "expansion_outreach",
  },
  other: {
    opener: (c) => `Se identificó una oportunidad para ${c} a partir de contexto directo del equipo comercial.`,
    channel: "email",
    playbook: "manual_entry_outreach",
  },
};

export interface ManualOpportunityInput {
  company_name: string;
  company_domain?: string;
  company_industry?: string;
  company_country?: string;
  lead_full_name?: string;
  lead_email?: string;
  lead_title?: string;
  lead_seniority?: string;
  lead_linkedin_url?: string;
  signal_type: SignalType;
  title?: string;
  description: string;
  score: number;
}

/** Local counterpart to the real backend's `POST /opportunities`: resolves
 * a company_id/lead_id the same slug-of-the-name way `demoFetchCompanies`/
 * `demoFetchLeads` already read (so a manually-added account shows up in
 * Empresas/Leads immediately, same as the real one does via get-or-create),
 * and writes a strategy that's always complete — same as the real
 * `GenericStrategyGenerator` safety net always produces a usable battlecard
 * — so it's promoted straight to `ready_to_action`, matching what the real
 * endpoint does for the same input. */
export function buildManualOpportunitySet(input: ManualOpportunityInput): DemoCompanySet {
  const now = new Date().toISOString();
  const signalId = randomId();
  const opportunityId = randomId();
  const companyName = input.company_name.trim();
  const leadName = input.lead_full_name?.trim() || null;
  const companyId = `demo-company-${slug(companyName)}`;
  const leadId = leadName ? `demo-lead-${slug(leadName)}` : null;
  const flavor = SIGNAL_FLAVOR[input.signal_type] ?? SIGNAL_FLAVOR.other;
  const description = input.description.trim();
  const title = input.title?.trim() || `Oportunidad: ${companyName}`;
  const urgency = input.score >= 75 ? "immediate" : input.score >= 50 ? "this_week" : "this_month";
  const hotLead = input.score >= 75;

  const signal: Signal = {
    id: signalId,
    signal_type: input.signal_type,
    source: "manual",
    title: input.title?.trim() || `${companyName} — agregado manualmente`,
    description,
    score: input.score,
    confidence: 1,
    detected_at: now,
    company_id: companyId,
    lead_id: leadId,
    analysis: { tags: ["manual_entry"], analyzers: ["manual"], primary_analyzer: "manual" },
  };

  const contactSuffix = leadName
    ? ` con ${leadName}${input.lead_title ? ` (${input.lead_title})` : ""}`
    : "";

  const strategy = {
    pain_point: `${flavor.opener(companyName)} ${description}`,
    closing_argument: `Vale la pena una conversación${contactSuffix} sobre cómo ${companyName} está evaluando esto ahora mismo.`,
    timing_window: {
      urgency: urgency as "immediate" | "this_week" | "this_month",
      reason: "Contexto cargado a mano por el equipo comercial — prioridad según su propia evaluación.",
      expires_at: null,
    },
    playbook: flavor.playbook,
    next_best_action: "reach_out",
    channel: flavor.channel,
    generator: "manual_entry",
    generator_version: "1.0.0",
    generated_at: now,
    rationale: `Oportunidad cargada a mano. Score ${input.score}/100 — ${companyName}${leadName ? ` / ${leadName}` : ""}.`,
    confidence_score: 0.6,
    manual_review_required: false,
    variant_id: null,
    variant_arm: null,
    hot_lead: hotLead,
  };

  const opportunity: Opportunity = {
    id: opportunityId,
    title,
    status: "ready_to_action",
    score: input.score,
    strategy,
    signal_id: signalId,
    lead_id: leadId,
    company_id: companyId,
    assigned_to_user_id: null,
    amount: null,
    expected_close_date: null,
    qualification: {},
    created_at: now,
    updated_at: now,
    loss_reason: null,
    competitor: null,
    closed_at: null,
  };

  const battlecard: Battlecard = {
    opportunity_id: opportunityId,
    title,
    status: "ready_to_action",
    score: input.score,
    ready_to_action: true,
    hot_lead: hotLead,
    manual_review_required: false,
    company: {
      name: companyName,
      domain: input.company_domain?.trim() || null,
      industry: input.company_industry?.trim() || null,
      country: input.company_country?.trim() || null,
    },
    lead: {
      full_name: leadName,
      title: input.lead_title?.trim() || null,
      email: input.lead_email?.trim() || null,
      seniority: input.lead_seniority?.trim() || null,
      linkedin_url: input.lead_linkedin_url?.trim() || null,
    },
    signal: {
      id: signalId,
      signal_type: signal.signal_type,
      title: signal.title,
      description: signal.description,
      score: signal.score,
      detected_at: signal.detected_at,
      tags: signal.analysis.tags ?? [],
    },
    strategy,
    created_at: now,
    updated_at: now,
  };

  const artifacts: ArtifactBundle = {
    opportunity_id: opportunityId,
    generated_at: now,
    generator: "rule_based_artifacts",
    email_draft: {
      artifact_type: "email_draft",
      subject: `${companyName} — próximo paso`,
      body: `Hola${leadName ? ` ${leadName.split(" ")[0]}` : ""},\n\n${strategy.closing_argument}\n\nSaludos,\n[Tu nombre]`,
      ps_line: null,
      recommended_send_time: "Martes–jueves, 8–10 AM hora local",
      estimated_read_time_seconds: 20,
    },
    meeting_structure: {
      artifact_type: "meeting_structure",
      meeting_title: `${companyName} — Llamada de descubrimiento`,
      total_duration_minutes: 20,
      objective: `Entender el contexto de ${companyName} y definir un próximo paso concreto.`,
      agenda_items: [
        { duration_minutes: 5, title: "Contexto y objetivos", notes: null },
        { duration_minutes: 10, title: "Lo que motivó esta oportunidad", notes: description },
        { duration_minutes: 5, title: "Próximos pasos", notes: null },
      ],
      pre_meeting_prep: [`Revisar el contexto cargado sobre ${companyName}`],
      success_criteria: "Se define un próximo paso claro dentro de la semana.",
    },
    next_steps: {
      artifact_type: "next_steps",
      horizon: "Próximos 7 días",
      actions: [
        { action: "Contactar por el canal recomendado", owner: "rep", timing: "esta semana", priority: hotLead ? "high" : "medium" },
      ],
      key_risk: null,
      success_milestone: "Primer contacto realizado.",
    },
    context_snapshot: {
      company: companyName,
      lead: leadName,
      signal_type: signal.signal_type,
      playbook: strategy.playbook,
      channel: strategy.channel,
    },
  };

  return { signal, opportunity, battlecard, artifacts };
}
