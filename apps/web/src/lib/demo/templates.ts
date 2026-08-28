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
