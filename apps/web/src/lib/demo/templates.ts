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
 *
 * Both builder functions below take a `Locale` and produce the requested
 * language's narrative content — see `lib/demo/store.ts` for where that
 * locale comes from (the visitor's own language choice, via
 * `getDemoLocale()`). A visitor typing their own company name/description
 * in English still gets English-language surrounding copy either way;
 * their own typed text (e.g. `ManualOpportunityInput.description`) is
 * never translated — it's carried through verbatim, exactly like the real
 * backend does.
 */
import { defaultLocale, type Locale } from "@/i18n/locales";
import type {
  ArtifactBundle,
  Battlecard,
  Opportunity,
  Signal,
  SignalType,
} from "@/types/domain";
import type { EmployeeRange } from "@/lib/api/organizations";

const PAIN_BY_SIZE: Record<Locale, Record<EmployeeRange, string>> = {
  es: {
    "1-10": "Con un equipo tan chico, cada hora en prospección manual es una hora que no vuelve — no hay margen para señales que se pierden.",
    "11-50": "En esta etapa el pipeline crece más rápido que la capacidad de investigar cada cuenta a mano — las señales importantes se mezclan con ruido.",
    "51-200": "Con varios reps trabajando en paralelo, sin un sistema central de señales cada uno prioriza distinto — se pierde consistencia en el approach.",
    "201-500": "A esta escala, coordinar qué cuenta atacar primero entre varios equipos sin datos centralizados es prácticamente imposible a mano.",
    "501-1000": "Con esta cantidad de cuentas en juego, el costo de no priorizar bien es directo: presupuesto de outbound gastado en las cuentas equivocadas.",
    "1000+": "A escala enterprise, la señal correcta puede estar en cualquiera de miles de cuentas — sin un motor que la detecte, se pierde en el ruido.",
  },
  en: {
    "1-10": "With a team this small, every hour spent on manual prospecting is an hour you don't get back — no room for signal that slips through.",
    "11-50": "At this stage pipeline grows faster than the capacity to research every account by hand — the signals that matter blend into noise.",
    "51-200": "With several reps working in parallel and no central signal system, everyone prioritizes differently — consistency of approach breaks down.",
    "201-500": "At this scale, coordinating which account to chase first across multiple teams without centralized data is practically impossible by hand.",
    "501-1000": "With this many accounts in play, the cost of prioritizing poorly is direct: outbound budget spent on the wrong accounts.",
    "1000+": "At enterprise scale, the right signal could be sitting in any of thousands of accounts — without an engine to catch it, it's lost in the noise.",
  },
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

const SELF_EVAL_COPY: Record<
  Locale,
  {
    signalTitle: (name: string) => string;
    signalDescription: string;
    closingArgument: (name: string) => string;
    timingReason: string;
    rationale: (name: string, range: EmployeeRange) => string;
    opportunityTitle: (name: string) => string;
    emailSubject: (name: string) => string;
    emailBody: (closingArgument: string) => string;
    sendTime: string;
    meetingTitle: (name: string) => string;
    meetingObjective: (name: string) => string;
    agendaContext: string;
    agendaPriorities: string;
    agendaNextSteps: string;
    prepReviewSite: (name: string) => string;
    prepConfirmProcess: string;
    successCriteria: string;
    nextStepsHorizon: string;
    keepExploring: string;
    createRealAccount: string;
    now: string;
    whenever: string;
    successMilestone: string;
  }
> = {
  es: {
    signalTitle: (name) => `${name} está evaluando herramientas de inteligencia comercial`,
    signalDescription: "Detectado ahora mismo, en este sandbox — el mismo tipo de señal de intención que BEE captura de una visita a pricing o una demo agendada.",
    closingArgument: (name) => `${name}, ya estás mirando cómo priorizar señales de mercado — el paso que sigue es dejar que un motor lo haga por ti, todo el tiempo, no solo hoy.`,
    timingReason: "Ventana de evaluación activa",
    rationale: (name, range) => `Señal de intención de primera parte: ${name} (${range} empleados) está probando BEE en este momento.`,
    opportunityTitle: (name) => `Oportunidad: ${name} está evaluando BEE`,
    emailSubject: (name) => `${name} — probando BEE, esto es lo que armamos`,
    emailBody: (closingArgument) => `Hola,\n\n${closingArgument}\n\nSi esto es útil, sigamos la conversación.\n\nSaludos,\n[Tu nombre]`,
    sendTime: "Martes–jueves, 8–10 AM hora local",
    meetingTitle: (name) => `BEE × ${name} — Llamada de descubrimiento`,
    meetingObjective: (name) => `Entender si BEE encaja con el proceso comercial de ${name} y definir un próximo paso concreto.`,
    agendaContext: "Contexto y objetivos",
    agendaPriorities: "Cómo prioriza señales el equipo hoy",
    agendaNextSteps: "Próximos pasos",
    prepReviewSite: (name) => `Revisar el sitio de ${name}`,
    prepConfirmProcess: "Confirmar quién define el proceso comercial hoy",
    successCriteria: "Se define un próximo paso claro dentro de la semana.",
    nextStepsHorizon: "Próximos 7 días",
    keepExploring: "Seguir explorando el pipeline en este sandbox",
    createRealAccount: "Crear una cuenta real cuando quieras cargar tus propios datos",
    now: "ahora",
    whenever: "cuando quieras",
    successMilestone: "Cuenta real creada.",
  },
  en: {
    signalTitle: (name) => `${name} is evaluating sales intelligence tools`,
    signalDescription: "Detected right now, in this sandbox — the same kind of intent signal BEE captures from a pricing-page visit or a booked demo.",
    closingArgument: (name) => `${name}, you're already looking at how to prioritize market signal — the next step is letting an engine do it for you, all the time, not just today.`,
    timingReason: "Active evaluation window",
    rationale: (name, range) => `First-party intent signal: ${name} (${range} employees) is trying BEE right now.`,
    opportunityTitle: (name) => `Opportunity: ${name} is evaluating BEE`,
    emailSubject: (name) => `${name} — trying out BEE, here's what we put together`,
    emailBody: (closingArgument) => `Hi,\n\n${closingArgument}\n\nIf this is useful, let's keep the conversation going.\n\nBest,\n[Your name]`,
    sendTime: "Tuesday–Thursday, 8–10 AM local time",
    meetingTitle: (name) => `BEE × ${name} — Discovery call`,
    meetingObjective: (name) => `Understand whether BEE fits ${name}'s sales process and define a concrete next step.`,
    agendaContext: "Context and goals",
    agendaPriorities: "How the team prioritizes signal today",
    agendaNextSteps: "Next steps",
    prepReviewSite: (name) => `Review ${name}'s website`,
    prepConfirmProcess: "Confirm who owns the sales process today",
    successCriteria: "A clear next step is defined within the week.",
    nextStepsHorizon: "Next 7 days",
    keepExploring: "Keep exploring the pipeline in this sandbox",
    createRealAccount: "Create a real account whenever you're ready to load your own data",
    now: "now",
    whenever: "whenever",
    successMilestone: "Real account created.",
  },
};

export function buildDemoCompanySet(
  companyName: string,
  employeeRange: EmployeeRange,
  locale: Locale = defaultLocale,
): DemoCompanySet {
  const t = SELF_EVAL_COPY[locale];
  const now = new Date().toISOString();
  const signalId = randomId();
  const opportunityId = randomId();
  const pain = PAIN_BY_SIZE[locale][employeeRange];
  const name = companyName.trim();

  const signal: Signal = {
    id: signalId,
    signal_type: "tech_adoption",
    source: "webhook",
    title: t.signalTitle(name),
    description: t.signalDescription,
    score: 81,
    confidence: 0.7,
    detected_at: now,
    company_id: null,
    lead_id: null,
    analysis: { tags: ["intent", "self_reported"], analyzers: ["generic_fallback"], primary_analyzer: "generic_fallback" },
  };

  const closingArgument = t.closingArgument(name);
  const strategy = {
    pain_point: pain,
    closing_argument: closingArgument,
    timing_window: { urgency: "this_week" as const, reason: t.timingReason, expires_at: null },
    playbook: "self_serve_evaluation",
    next_best_action: "reach_out",
    channel: "email",
    generator: "rule_based",
    generator_version: "1.0.0",
    generated_at: now,
    rationale: t.rationale(name, employeeRange),
    confidence_score: 0.7,
    manual_review_required: false,
    variant_id: null,
    variant_arm: null,
  };

  const opportunity: Opportunity = {
    id: opportunityId,
    title: t.opportunityTitle(name),
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
      subject: t.emailSubject(name),
      body: t.emailBody(closingArgument),
      ps_line: null,
      recommended_send_time: t.sendTime,
      estimated_read_time_seconds: 20,
    },
    meeting_structure: {
      artifact_type: "meeting_structure",
      meeting_title: t.meetingTitle(name),
      total_duration_minutes: 20,
      objective: t.meetingObjective(name),
      agenda_items: [
        { duration_minutes: 5, title: t.agendaContext, notes: null },
        { duration_minutes: 10, title: t.agendaPriorities, notes: pain },
        { duration_minutes: 5, title: t.agendaNextSteps, notes: null },
      ],
      pre_meeting_prep: [t.prepReviewSite(name), t.prepConfirmProcess],
      success_criteria: t.successCriteria,
    },
    next_steps: {
      artifact_type: "next_steps",
      horizon: t.nextStepsHorizon,
      actions: [
        { action: t.keepExploring, owner: "rep", timing: t.now, priority: "medium" },
        { action: t.createRealAccount, owner: "rep", timing: t.whenever, priority: "low" },
      ],
      key_risk: null,
      success_milestone: t.successMilestone,
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

const SIGNAL_FLAVOR: Record<Locale, Record<SignalType, SignalFlavor>> = {
  es: {
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
  },
  en: {
    funding_round: {
      opener: (c) => `${c} is in an active budget-allocation window following a recent funding event.`,
      channel: "email",
      playbook: "post_funding_outreach",
    },
    hiring: {
      opener: (c) => `${c} is in active sales-hiring mode — the incoming team needs tools that scale with headcount.`,
      channel: "linkedin",
      playbook: "hiring_growth_outreach",
    },
    leadership_change: {
      opener: (c) => `${c} added new leadership — the "blank slate" window, with no loyalty to current vendors, is open.`,
      channel: "linkedin",
      playbook: "leadership_change_outreach",
    },
    tech_adoption: {
      opener: (c) => `${c} is mid stack-change — receptiveness to adjacent tools is usually at its peak right now.`,
      channel: "email",
      playbook: "complementary_tech_pitch",
    },
    product_launch: {
      opener: (c) => `${c} just launched a product — a moment of high internal visibility to justify new sales investment.`,
      channel: "email",
      playbook: "product_launch_outreach",
    },
    engagement: {
      opener: (c) => `${c} showed direct intent (a visit, a download, an interaction) — the closest signal there is to "ready to talk".`,
      channel: "email",
      playbook: "warm_engagement_outreach",
    },
    news_mention: {
      opener: (c) => `${c} appeared in the press recently — a good conversation hook with fresh, verifiable context.`,
      channel: "email",
      playbook: "news_hook_outreach",
    },
    expansion: {
      opener: (c) => `${c} is expanding operations — a new office or market usually comes with new budget.`,
      channel: "email",
      playbook: "expansion_outreach",
    },
    other: {
      opener: (c) => `An opportunity was identified for ${c} from direct context provided by the sales team.`,
      channel: "email",
      playbook: "manual_entry_outreach",
    },
  },
};

const MANUAL_COPY: Record<
  Locale,
  {
    defaultTitle: (name: string) => string;
    autoTitle: (name: string) => string;
    closingArgument: (company: string, contactSuffix: string) => string;
    contactSuffix: (leadName: string, title: string) => string;
    timingReason: string;
    rationale: (score: number, company: string, leadSuffix: string) => string;
    leadSuffix: (leadName: string) => string;
    emailSubject: (name: string) => string;
    emailBody: (greeting: string, closingArgument: string) => string;
    greeting: (leadFirstName: string) => string;
    sendTime: string;
    meetingTitle: (name: string) => string;
    meetingObjective: (name: string) => string;
    agendaContext: string;
    agendaMotivation: string;
    agendaNextSteps: string;
    prepReview: (name: string) => string;
    successCriteria: string;
    nextStepsHorizon: string;
    contactAction: string;
    thisWeek: string;
    successMilestone: string;
  }
> = {
  es: {
    defaultTitle: (name) => `Oportunidad: ${name}`,
    autoTitle: (name) => `${name} — agregado manualmente`,
    closingArgument: (company, contactSuffix) => `Vale la pena una conversación${contactSuffix} sobre cómo ${company} está evaluando esto ahora mismo.`,
    contactSuffix: (leadName, title) => ` con ${leadName}${title ? ` (${title})` : ""}`,
    timingReason: "Contexto cargado a mano por el equipo comercial — prioridad según su propia evaluación.",
    rationale: (score, company, leadSuffix) => `Oportunidad cargada a mano. Score ${score}/100 — ${company}${leadSuffix}.`,
    leadSuffix: (leadName) => ` / ${leadName}`,
    emailSubject: (name) => `${name} — próximo paso`,
    emailBody: (greeting, closingArgument) => `Hola${greeting},\n\n${closingArgument}\n\nSaludos,\n[Tu nombre]`,
    greeting: (leadFirstName) => ` ${leadFirstName}`,
    sendTime: "Martes–jueves, 8–10 AM hora local",
    meetingTitle: (name) => `${name} — Llamada de descubrimiento`,
    meetingObjective: (name) => `Entender el contexto de ${name} y definir un próximo paso concreto.`,
    agendaContext: "Contexto y objetivos",
    agendaMotivation: "Lo que motivó esta oportunidad",
    agendaNextSteps: "Próximos pasos",
    prepReview: (name) => `Revisar el contexto cargado sobre ${name}`,
    successCriteria: "Se define un próximo paso claro dentro de la semana.",
    nextStepsHorizon: "Próximos 7 días",
    contactAction: "Contactar por el canal recomendado",
    thisWeek: "esta semana",
    successMilestone: "Primer contacto realizado.",
  },
  en: {
    defaultTitle: (name) => `Opportunity: ${name}`,
    autoTitle: (name) => `${name} — added manually`,
    closingArgument: (company, contactSuffix) => `Worth a conversation${contactSuffix} about how ${company} is evaluating this right now.`,
    contactSuffix: (leadName, title) => ` with ${leadName}${title ? ` (${title})` : ""}`,
    timingReason: "Context entered by hand by the sales team — priority per their own assessment.",
    rationale: (score, company, leadSuffix) => `Manually entered opportunity. Score ${score}/100 — ${company}${leadSuffix}.`,
    leadSuffix: (leadName) => ` / ${leadName}`,
    emailSubject: (name) => `${name} — next step`,
    emailBody: (greeting, closingArgument) => `Hi${greeting},\n\n${closingArgument}\n\nBest,\n[Your name]`,
    greeting: (leadFirstName) => ` ${leadFirstName}`,
    sendTime: "Tuesday–Thursday, 8–10 AM local time",
    meetingTitle: (name) => `${name} — Discovery call`,
    meetingObjective: (name) => `Understand ${name}'s context and define a concrete next step.`,
    agendaContext: "Context and goals",
    agendaMotivation: "What prompted this opportunity",
    agendaNextSteps: "Next steps",
    prepReview: (name) => `Review the context entered about ${name}`,
    successCriteria: "A clear next step is defined within the week.",
    nextStepsHorizon: "Next 7 days",
    contactAction: "Reach out via the recommended channel",
    thisWeek: "this week",
    successMilestone: "First contact made.",
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
export function buildManualOpportunitySet(
  input: ManualOpportunityInput,
  locale: Locale = defaultLocale,
): DemoCompanySet {
  const t = MANUAL_COPY[locale];
  const now = new Date().toISOString();
  const signalId = randomId();
  const opportunityId = randomId();
  const companyName = input.company_name.trim();
  const leadName = input.lead_full_name?.trim() || null;
  const companyId = `demo-company-${slug(companyName)}`;
  const leadId = leadName ? `demo-lead-${slug(leadName)}` : null;
  const flavor = SIGNAL_FLAVOR[locale][input.signal_type] ?? SIGNAL_FLAVOR[locale].other;
  const description = input.description.trim();
  const title = input.title?.trim() || t.defaultTitle(companyName);
  const urgency = input.score >= 75 ? "immediate" : input.score >= 50 ? "this_week" : "this_month";
  const hotLead = input.score >= 75;

  const signal: Signal = {
    id: signalId,
    signal_type: input.signal_type,
    source: "manual",
    title: input.title?.trim() || t.autoTitle(companyName),
    description,
    score: input.score,
    confidence: 1,
    detected_at: now,
    company_id: companyId,
    lead_id: leadId,
    analysis: { tags: ["manual_entry"], analyzers: ["manual"], primary_analyzer: "manual" },
  };

  const contactSuffix = leadName ? t.contactSuffix(leadName, input.lead_title ?? "") : "";

  const strategy = {
    pain_point: `${flavor.opener(companyName)} ${description}`,
    closing_argument: t.closingArgument(companyName, contactSuffix),
    timing_window: {
      urgency: urgency as "immediate" | "this_week" | "this_month",
      reason: t.timingReason,
      expires_at: null,
    },
    playbook: flavor.playbook,
    next_best_action: "reach_out",
    channel: flavor.channel,
    generator: "manual_entry",
    generator_version: "1.0.0",
    generated_at: now,
    rationale: t.rationale(input.score, companyName, leadName ? t.leadSuffix(leadName) : ""),
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
      subject: t.emailSubject(companyName),
      body: t.emailBody(leadName ? t.greeting(leadName.split(" ")[0]) : "", strategy.closing_argument),
      ps_line: null,
      recommended_send_time: t.sendTime,
      estimated_read_time_seconds: 20,
    },
    meeting_structure: {
      artifact_type: "meeting_structure",
      meeting_title: t.meetingTitle(companyName),
      total_duration_minutes: 20,
      objective: t.meetingObjective(companyName),
      agenda_items: [
        { duration_minutes: 5, title: t.agendaContext, notes: null },
        { duration_minutes: 10, title: t.agendaMotivation, notes: description },
        { duration_minutes: 5, title: t.agendaNextSteps, notes: null },
      ],
      pre_meeting_prep: [t.prepReview(companyName)],
      success_criteria: t.successCriteria,
    },
    next_steps: {
      artifact_type: "next_steps",
      horizon: t.nextStepsHorizon,
      actions: [
        { action: t.contactAction, owner: "rep", timing: t.thisWeek, priority: hotLead ? "high" : "medium" },
      ],
      key_risk: null,
      success_milestone: t.successMilestone,
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
