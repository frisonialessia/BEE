/**
 * Historial ampliado del sandbox — se suma a los 2 ejemplos originales de
 * `lib/sample-data.ts` (Northwind Labs, Acme Corp) para que el pipeline de
 * `/probar` tenga suficiente profundidad como para que Ganado/Perdido,
 * Pronóstico, Priorización y la predicción de ciclo de venta (ver
 * `lib/cycle-prediction.ts`) muestren algo real en vez de "todavía no hay
 * datos" apenas se abre el sandbox.
 *
 * Sigue exactamente el mismo patrón de honestidad que el resto de la demo:
 * ningún dato se presenta como "en vivo", todo pasa por `live: false`. Las
 * fechas son relativas a "ahora" (Date.now() - N días), igual que los 2
 * ejemplos originales, así que el historial siempre luce reciente sin
 * importar cuándo se abra el sandbox.
 */
import type {
  Battlecard,
  BattlecardStrategy,
  LossReason,
  Opportunity,
  Signal,
  SignalType,
} from "@/types/domain";

function daysAgoIso(days: number, hours = 0): string {
  return new Date(Date.now() - (days * 24 + hours) * 3600_000).toISOString();
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

interface Template {
  painPoint: (company: string) => string;
  closingArgument: (company: string) => string;
  playbook: string;
  channel: string;
  signalTitle: (company: string) => string;
  signalDescription: string;
}

const TEMPLATES: Record<SignalType, Template> = {
  funding_round: {
    painPoint: (c) => `${c} acaba de levantar una ronda y ahora tiene que escalar go-to-market más rápido de lo que sus procesos actuales aguantan.`,
    closingArgument: (c) => `Felicitaciones a ${c} por la ronda — es justo el momento en que priorizar bien las cuentas correctas define si ese capital rinde en el primer trimestre.`,
    playbook: "post_funding_outreach",
    channel: "email",
    signalTitle: (c) => `${c} cerró una ronda de financiación`,
    signalDescription: "Ronda anunciada públicamente — ventana de asignación de presupuesto activa.",
  },
  hiring: {
    painPoint: (c) => `${c} está contratando para ventas más rápido de lo que su stack actual puede soportar — cada nueva contratación sin buenas señales tarda más en rampear.`,
    closingArgument: (c) => `Vi que ${c} está creciendo el equipo comercial — los equipos que crecen así de rápido suelen necesitar un sistema de priorización antes de que el ritmo de contratación supere al de resultados.`,
    playbook: "hiring_signal_outreach",
    channel: "linkedin",
    signalTitle: (c) => `${c} abrió varias posiciones comerciales`,
    signalDescription: "Múltiples vacantes de ventas/RevOps publicadas en las últimas semanas.",
  },
  tech_adoption: {
    painPoint: (c) => `${c} migró parte de su stack recientemente — normalmente eso destapa huecos en cómo conectan señales de mercado con el equipo comercial.`,
    closingArgument: (c) => `Notamos que ${c} adoptó nueva tecnología en su stack — eso suele abrir una ventana corta para revisar qué más del proceso comercial vale la pena modernizar al mismo tiempo.`,
    playbook: "tech_adoption_outreach",
    channel: "email",
    signalTitle: (c) => `${c} adoptó nueva tecnología en su stack`,
    signalDescription: "Cambio de stack detectado — nuevas integraciones visibles públicamente.",
  },
  leadership_change: {
    painPoint: (c) => `El nuevo liderazgo de ${c} está auditando proveedores y herramientas en sus primeros 90 días — es el momento en que se deciden reemplazos.`,
    closingArgument: (c) => `Vi la nueva contratación de liderazgo en ${c} — los primeros 90 días de un rol así suelen ser cuando se define qué stack se queda y cuál se reemplaza.`,
    playbook: "leadership_change_outreach",
    channel: "linkedin",
    signalTitle: (c) => `${c} sumó liderazgo nuevo al equipo comercial`,
    signalDescription: "Nueva contratación de liderazgo detectada en fuentes públicas.",
  },
  product_launch: {
    painPoint: (c) => `${c} acaba de lanzar producto nuevo — eso normalmente dispara una ola de prospección para la que el equipo todavía no tiene proceso.`,
    closingArgument: (c) => `Felicitaciones por el lanzamiento — ${c} probablemente va a ver un pico de interés entrante que vale la pena priorizar bien desde el día uno.`,
    playbook: "product_launch_outreach",
    channel: "email",
    signalTitle: (c) => `${c} lanzó un producto nuevo`,
    signalDescription: "Lanzamiento público detectado — pico esperado de interés entrante.",
  },
  engagement: {
    painPoint: (c) => `${c} lleva semanas interactuando con contenido de la categoría — interés genuino, pero sin un sistema que lo capture a tiempo se enfría.`,
    closingArgument: (c) => `${c} ha estado bastante activo investigando la categoría — vale la pena una conversación antes de que ese interés se disperse en otra prioridad.`,
    playbook: "engagement_outreach",
    channel: "email",
    signalTitle: (c) => `${c} muestra actividad de investigación sostenida`,
    signalDescription: "Múltiples interacciones con contenido de la categoría en las últimas semanas.",
  },
  news_mention: {
    painPoint: (c) => `${c} salió en prensa por su crecimiento — la atención mediática suele traer más inbound del que el equipo comercial puede calificar a mano.`,
    closingArgument: (c) => `Vi la mención de ${c} en prensa — buen momento para asegurarse de que el inbound que eso genera no se pierda por falta de priorización.`,
    playbook: "news_mention_outreach",
    channel: "email",
    signalTitle: (c) => `${c} apareció en cobertura de prensa reciente`,
    signalDescription: "Mención en medios detectada — posible pico de inbound asociado.",
  },
  expansion: {
    painPoint: (c) => `${c} está expandiendo operaciones — coordinar prioridades comerciales entre más equipos sin un sistema central es donde se empieza a perder consistencia.`,
    closingArgument: (c) => `Buen momento para hablar — ${c} está expandiendo justo cuando más importa tener un criterio compartido de a qué cuenta atacar primero.`,
    playbook: "expansion_outreach",
    channel: "email",
    signalTitle: (c) => `${c} anunció expansión de operaciones`,
    signalDescription: "Nueva ubicación o mercado anunciado — indica nuevo presupuesto regional.",
  },
  other: {
    painPoint: (c) => `${c} mostró una señal de mercado relevante que vale la pena calificar antes de que se enfríe.`,
    closingArgument: (c) => `Vimos actividad reciente de ${c} que sugiere que este es un buen momento para una conversación.`,
    playbook: "generic_outreach",
    channel: "email",
    signalTitle: (c) => `Señal de mercado detectada en ${c}`,
    signalDescription: "Señal capturada por el motor de detección general.",
  },
};

const MEDDIC_KEYS = ["metric", "economic_buyer", "decision_criteria", "decision_process", "identify_pain", "champion"] as const;

function qualificationWith(trueCount: number): Record<string, boolean> {
  const q: Record<string, boolean> = {};
  MEDDIC_KEYS.forEach((key, i) => {
    q[key] = i < trueCount;
  });
  return q;
}

interface SeedDef {
  id: string;
  company: string;
  domain: string;
  industry: string;
  country: string;
  signalType: SignalType;
  leadName: string;
  leadTitle: string;
  seniority: string;
  amount: number;
  score: number;
  daysAgoCreated: number;
  outcome: "won" | "lost" | "in_progress" | "ready_to_action" | "detected";
  cycleDays?: number; // only for won/lost
  qualifiedCount: number;
  lossReason?: LossReason;
  competitor?: string | null;
}

const SEEDS: SeedDef[] = [
  { id: "s01", company: "Vantage Studio", domain: "vantagestudio.mx", industry: "Diseño de producto", country: "México", signalType: "funding_round", leadName: "Camila Reyes", leadTitle: "Directora Comercial", seniority: "director", amount: 38000, score: 88, daysAgoCreated: 142, outcome: "won", cycleDays: 34, qualifiedCount: 6 },
  { id: "s02", company: "Río Verde Logística", domain: "rioverdelog.com", industry: "Logística", country: "México", signalType: "expansion", leadName: "Héctor Salinas", leadTitle: "VP de Operaciones", seniority: "vp", amount: 26000, score: 61, daysAgoCreated: 118, outcome: "lost", cycleDays: 52, qualifiedCount: 2, lossReason: "budget", competitor: "HubSpot" },
  { id: "s03", company: "Cumbre Salud", domain: "cumbresalud.co", industry: "Salud digital", country: "Colombia", signalType: "funding_round", leadName: "Valentina Ospina", leadTitle: "CEO", seniority: "c_level", amount: 61000, score: 94, daysAgoCreated: 156, outcome: "won", cycleDays: 28, qualifiedCount: 6 },
  { id: "s04", company: "Bright Retail Co", domain: "brightretail.com", industry: "Retail", country: "Estados Unidos", signalType: "tech_adoption", leadName: "Marcus Webb", leadTitle: "Head of Sales", seniority: "director", amount: 33000, score: 68, daysAgoCreated: 22, outcome: "in_progress", qualifiedCount: 3 },
  { id: "s05", company: "Andina Fintech", domain: "andinafintech.pe", industry: "Fintech", country: "Perú", signalType: "leadership_change", leadName: "Rodrigo Paz", leadTitle: "VP Revenue Operations", seniority: "vp", amount: 45000, score: 72, daysAgoCreated: 95, outcome: "lost", cycleDays: 41, qualifiedCount: 3, lossReason: "no_decision", competitor: null },
  { id: "s06", company: "Solaris Manufactura", domain: "solarismfg.mx", industry: "Manufactura", country: "México", signalType: "hiring", leadName: "Patricia León", leadTitle: "Gerente Comercial", seniority: "manager", amount: 19500, score: 65, daysAgoCreated: 130, outcome: "won", cycleDays: 45, qualifiedCount: 5 },
  { id: "s07", company: "Nimbus Cloud Systems", domain: "nimbuscloud.io", industry: "Infraestructura cloud", country: "Estados Unidos", signalType: "product_launch", leadName: "Ashley Turner", leadTitle: "VP Sales", seniority: "vp", amount: 72000, score: 89, daysAgoCreated: 6, outcome: "ready_to_action", qualifiedCount: 5 },
  { id: "s08", company: "EduNova", domain: "edunova.mx", industry: "EdTech", country: "México", signalType: "engagement", leadName: "Daniela Cruz", leadTitle: "Directora de Ventas", seniority: "director", amount: 15000, score: 54, daysAgoCreated: 88, outcome: "lost", cycleDays: 22, qualifiedCount: 1, lossReason: "price", competitor: "Salesforce" },
  { id: "s09", company: "Horizonte Legal", domain: "horizontelegal.cl", industry: "LegalTech", country: "Chile", signalType: "news_mention", leadName: "Ignacio Fuentes", leadTitle: "Socio Director", seniority: "c_level", amount: 29000, score: 79, daysAgoCreated: 104, outcome: "won", cycleDays: 39, qualifiedCount: 5 },
  { id: "s10", company: "Puerto Digital", domain: "puertodigital.mx", industry: "Comercio exterior", country: "México", signalType: "expansion", leadName: "Sofía Bravo", leadTitle: "VP Comercial", seniority: "vp", amount: 41000, score: 70, daysAgoCreated: 11, outcome: "in_progress", qualifiedCount: 4 },
  { id: "s11", company: "Meridian Health Group", domain: "meridianhealth.com", industry: "Salud", country: "Estados Unidos", signalType: "funding_round", leadName: "Jordan Ellis", leadTitle: "CRO", seniority: "c_level", amount: 85000, score: 83, daysAgoCreated: 76, outcome: "lost", cycleDays: 60, qualifiedCount: 3, lossReason: "timing", competitor: null },
  { id: "s12", company: "Terra Agro Analytics", domain: "terraagro.com.ar", industry: "AgTech", country: "Argentina", signalType: "tech_adoption", leadName: "Lucía Fernández", leadTitle: "Gerente General", seniority: "c_level", amount: 24000, score: 66, daysAgoCreated: 112, outcome: "won", cycleDays: 31, qualifiedCount: 5 },
  { id: "s13", company: "Vega Real Estate Tech", domain: "vegaretech.mx", industry: "PropTech", country: "México", signalType: "hiring", leadName: "Emilio Duarte", leadTitle: "Director de Ventas", seniority: "director", amount: 18000, score: 47, daysAgoCreated: 2, outcome: "detected", qualifiedCount: 0 },
  { id: "s14", company: "Kaizen Manufacturing", domain: "kaizenmfg.com", industry: "Manufactura", country: "Estados Unidos", signalType: "leadership_change", leadName: "Brian Kessler", leadTitle: "VP Sales", seniority: "vp", amount: 52000, score: 71, daysAgoCreated: 68, outcome: "lost", cycleDays: 35, qualifiedCount: 2, lossReason: "product_fit", competitor: "Pipedrive" },
  { id: "s15", company: "Onda Media Group", domain: "ondamedia.mx", industry: "Medios", country: "México", signalType: "product_launch", leadName: "Renata Cabrera", leadTitle: "Directora Comercial", seniority: "director", amount: 22000, score: 75, daysAgoCreated: 90, outcome: "won", cycleDays: 26, qualifiedCount: 4 },
  { id: "s16", company: "Cobre Insurtech", domain: "cobreinsurtech.co", industry: "Seguros", country: "Colombia", signalType: "funding_round", leadName: "Andrés Molina", leadTitle: "VP Growth", seniority: "vp", amount: 47000, score: 77, daysAgoCreated: 16, outcome: "in_progress", qualifiedCount: 4 },
  { id: "s17", company: "Silo Data Works", domain: "silodata.io", industry: "Datos / Analytics", country: "Estados Unidos", signalType: "engagement", leadName: "Taylor Brooks", leadTitle: "Head of Revenue", seniority: "director", amount: 39000, score: 81, daysAgoCreated: 145, outcome: "won", cycleDays: 48, qualifiedCount: 6 },
  { id: "s18", company: "Raíz Educación", domain: "raizeducacion.mx", industry: "EdTech", country: "México", signalType: "news_mention", leadName: "Fernanda Ríos", leadTitle: "Gerente Comercial", seniority: "manager", amount: 12500, score: 58, daysAgoCreated: 4, outcome: "ready_to_action", qualifiedCount: 3 },
];

function buildStrategy(def: SeedDef, template: Template, createdAtIso: string): BattlecardStrategy {
  return {
    pain_point: template.painPoint(def.company),
    closing_argument: template.closingArgument(def.company),
    timing_window: { urgency: def.outcome === "ready_to_action" ? "immediate" : "this_week", reason: "Ventana de evaluación activa", expires_at: null },
    playbook: template.playbook,
    next_best_action: "reach_out",
    channel: template.channel,
    rationale: `Puntaje de señal ${def.score}/100 — ${def.company} (${def.industry}, ${def.country}).`,
    generator: "rule_based",
    generator_version: "1.0.0",
    generated_at: createdAtIso,
    confidence_score: Math.round((def.score / 100) * 100) / 100,
    manual_review_required: false,
    variant_id: null,
    variant_arm: null,
  };
}

function statusFor(outcome: SeedDef["outcome"]): Opportunity["status"] {
  if (outcome === "won" || outcome === "lost") return outcome;
  if (outcome === "ready_to_action") return "ready_to_action";
  if (outcome === "in_progress") return "in_progress";
  return "detected";
}

const hasFullStrategy = (outcome: SeedDef["outcome"]) => outcome !== "detected";

export const historicalSignals: Signal[] = SEEDS.map((def) => {
  const template = TEMPLATES[def.signalType];
  const createdAtIso = daysAgoIso(def.daysAgoCreated, 3);
  return {
    id: `demo-signal-${def.id}`,
    signal_type: def.signalType,
    source: "webhook",
    title: template.signalTitle(def.company),
    description: template.signalDescription,
    score: def.score,
    confidence: Math.round((def.score / 100) * 0.9 * 100) / 100,
    detected_at: createdAtIso,
    company_id: null,
    lead_id: null,
    analysis: { tags: [def.signalType], analyzers: [def.signalType], primary_analyzer: def.signalType },
  };
});

export const historicalOpportunities: Opportunity[] = SEEDS.map((def) => {
  const template = TEMPLATES[def.signalType];
  const createdAtIso = daysAgoIso(def.daysAgoCreated, 3);
  const isClosed = def.outcome === "won" || def.outcome === "lost";
  const closedAtIso = isClosed && def.cycleDays ? daysAgoIso(def.daysAgoCreated - def.cycleDays, 3) : null;
  const strategy = hasFullStrategy(def.outcome) ? buildStrategy(def, template, createdAtIso) : {};

  return {
    id: `demo-opp-${def.id}`,
    title: `Oportunidad: ${template.signalTitle(def.company)}`,
    status: statusFor(def.outcome),
    score: def.score,
    strategy,
    signal_id: `demo-signal-${def.id}`,
    lead_id: null,
    company_id: null,
    assigned_to_user_id: null,
    amount: def.amount,
    expected_close_date: isClosed ? null : dateOnly(daysAgoIso(-14)),
    qualification: qualificationWith(def.qualifiedCount),
    created_at: createdAtIso,
    updated_at: closedAtIso ?? createdAtIso,
    loss_reason: def.outcome === "lost" ? (def.lossReason ?? "other") : null,
    competitor: def.competitor ?? null,
    closed_at: closedAtIso,
  };
});

/** Solo las oportunidades suficientemente calificadas (ready_to_action o
 * mejor) tienen battlecard completo — igual que en la app real, donde
 * READY_TO_ACTION es el gate que exige que la estrategia esté enriquecida
 * del todo. Una oportunidad "detected" recién detectada no tiene battlecard
 * todavía, ni en la demo ni en producción. */
export const historicalBattlecards: Battlecard[] = SEEDS.filter((def) =>
  ["won", "lost", "in_progress", "ready_to_action"].includes(def.outcome),
).map((def) => {
  const template = TEMPLATES[def.signalType];
  const createdAtIso = daysAgoIso(def.daysAgoCreated, 3);
  const strategy = buildStrategy(def, template, createdAtIso);

  return {
    opportunity_id: `demo-opp-${def.id}`,
    title: template.signalTitle(def.company),
    status: statusFor(def.outcome),
    score: def.score,
    ready_to_action: true,
    hot_lead: def.score >= 75,
    manual_review_required: false,
    company: { name: def.company, domain: def.domain, industry: def.industry, country: def.country },
    lead: { full_name: def.leadName, title: def.leadTitle, email: `${def.leadName.split(" ")[0].toLowerCase()}@${def.domain}`, seniority: def.seniority, linkedin_url: null },
    signal: {
      id: `demo-signal-${def.id}`,
      signal_type: def.signalType,
      title: template.signalTitle(def.company),
      description: template.signalDescription,
      score: def.score,
      detected_at: createdAtIso,
      tags: [def.signalType],
    },
    strategy,
    created_at: createdAtIso,
    updated_at: createdAtIso,
  };
});
