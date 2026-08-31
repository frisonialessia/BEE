import type { ArtifactBundle, Battlecard, Opportunity, Signal } from "@/lib/types";
import type { HotLeadScore } from "@/types/extended";
import { historicalBattlecards, historicalOpportunities, historicalSignals } from "@/lib/demo/seed-history";

/**
 * Illustrative data used when the backend API is not reachable (e.g. static
 * previews / first run before `docker compose up`). It keeps the dashboard fully
 * renderable and demonstrates the shape of real Signal Engine + Battlecard output.
 */
const baseSampleSignals: Signal[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    signal_type: "funding_round",
    source: "webhook",
    title: "Northwind Labs cerró una Serie B de $32M",
    description: "Liderada por Sequoia para acelerar el go-to-market en EMEA.",
    score: 92,
    confidence: 0.86,
    detected_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    company_id: "demo-company-northwind-labs",
    lead_id: "demo-lead-alice-mercer",
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
    title: "Acme Corp contrató a un nuevo VP de Revenue Operations",
    description: "Ex-líder de Datadog se suma para construir la función de RevOps.",
    score: 74,
    confidence: 0.71,
    detected_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    company_id: "demo-company-acme-corp",
    lead_id: "demo-lead-robert-chen",
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
    title: "Globex migró su stack de datos a Snowflake",
    description: "Se detectaron nuevas referencias de integración en su blog de ingeniería.",
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
    title: "Initech anunció una nueva oficina en Berlín",
    description: "Expansión europea que indica nuevos presupuestos regionales.",
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

/** Los 4 ejemplos originales + el historial ampliado en lib/demo/seed-history
 * (ver ese archivo para por qué existe: dar profundidad real a Ganado/
 * Perdido, Pronóstico y la predicción de ciclo de venta en /probar). */
export const sampleSignals: Signal[] = [...baseSampleSignals, ...historicalSignals];

const baseSampleOpportunities: Opportunity[] = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "Oportunidad: Northwind Labs cerró una Serie B de $32M",
    status: "ready_to_action",
    score: 92,
    strategy: {
      pain_point: "Los equipos post-financiación deben escalar su outbound antes de que se estanque el plan de contratación de 90 días.",
      closing_argument:
        "Felicitaciones por la Serie B — ayudamos a equipos recién financiados a acelerar su pipeline 2× más rápido en el primer trimestre.",
      timing_window: { urgency: "immediate" as const, reason: "Ventana de asignación de presupuesto", expires_at: "90 días" },
      playbook: "post_funding_outreach",
      next_best_action: "reach_out",
      channel: "email",
      generator: "rule_based",
      generated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      rationale:
        "Northwind Labs consiguió financiación recientemente — una ventana ideal para contactarlos mientras se asignan los presupuestos.",
    },
    signal_id: "11111111-1111-1111-1111-111111111111",
    lead_id: "demo-lead-alice-mercer",
    company_id: "demo-company-northwind-labs",
    assigned_to_user_id: null,
    amount: 48000,
    expected_close_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 21)
      .toISOString()
      .slice(0, 10),
    qualification: {
      metric: true,
      economic_buyer: true,
      identify_pain: true,
    },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    loss_reason: null,
    competitor: null,
    closed_at: null,
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    title: "Oportunidad: Acme Corp contrató a un nuevo VP de Revenue Operations",
    status: "ready_to_action",
    score: 74,
    strategy: {
      pain_point: "El nuevo líder de RevOps está evaluando todo el stack de ventas en sus primeros 90 días.",
      closing_argument:
        "Vi que te sumaste como VP de RevOps — los equipos en tu etapa suelen reconstruir su infraestructura de pipeline en el primer trimestre.",
      timing_window: { urgency: "this_week" as const, reason: "Ventana de evaluación de nueva contratación", expires_at: null },
      playbook: "leadership_change_outreach",
      next_best_action: "reach_out",
      channel: "linkedin",
      generator: "rule_based",
      generated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      rationale:
        "Un nuevo líder de RevOps está definiendo activamente decisiones de herramientas en sus primeros 90 días.",
    },
    signal_id: "22222222-2222-2222-2222-222222222222",
    lead_id: "demo-lead-robert-chen",
    company_id: "demo-company-acme-corp",
    assigned_to_user_id: null,
    amount: 21500,
    expected_close_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3)
      .toISOString()
      .slice(0, 10),
    qualification: {
      identify_pain: true,
    },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    loss_reason: null,
    competitor: null,
    closed_at: null,
  },
];

export const sampleOpportunities: Opportunity[] = [...baseSampleOpportunities, ...historicalOpportunities];

// Sample battlecards (one per opportunity) demonstrating the full CEO brief format.
const baseSampleBattlecards: Battlecard[] = [
  {
    opportunity_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "Northwind Labs cerró una Serie B de $32M",
    status: "ready_to_action",
    score: 92,
    ready_to_action: true,
    hot_lead: true,
    manual_review_required: false,
    company: {
      name: "Northwind Labs",
      domain: "northwindlabs.com",
      industry: "B2B SaaS",
      country: "Estados Unidos",
    },
    lead: {
      full_name: "Alice Mercer",
      title: "VP de Ventas",
      email: "alice@northwindlabs.com",
      seniority: "vp",
      linkedin_url: "https://linkedin.com/in/alicemercer",
    },
    signal: {
      id: "11111111-1111-1111-1111-111111111111",
      signal_type: "funding_round",
      title: "Northwind Labs cerró una Serie B de $32M",
      description: "Liderada por Sequoia para acelerar el go-to-market en EMEA.",
      score: 92,
      detected_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
      tags: ["funding", "series b"],
    },
    strategy: {
      pain_point:
        "Northwind Labs acaba de cerrar una Serie B de $32M y ahora enfrenta la paradoja clásica del scale-up: tienen capital para invertir pero sus procesos, herramientas y equipo actuales no están listos para la próxima fase de crecimiento. Cada semana de demora es una desventaja competitiva.",
      closing_argument:
        "Felicitaciones por la Serie B — las empresas en esta etapa suelen necesitar 2-3× su capacidad de go-to-market en los próximos 90 días. Ayudamos a equipos del tamaño de Northwind a lograr exactamente eso sin la penalización habitual del tiempo de ramp-up. ¿Tendría sentido una llamada de 20 minutos esta semana?",
      timing_window: {
        urgency: "immediate",
        reason:
          "Las decisiones de asignación de presupuesto se toman en los primeros 60 días después del cierre de la Serie B. Los proveedores que se contactan temprano tienen 3× más probabilidades de ser elegidos.",
        expires_at: "60 días desde el cierre de financiación",
      },
      playbook: "post_funding_outreach",
      next_best_action: "reach_out",
      channel: "email",
      rationale: "Puntaje de señal 92/100 — Northwind Labs cerró una Serie B ($32M). Lead: Alice Mercer.",
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
    title: "Acme Corp contrató a un nuevo VP de Revenue Operations",
    status: "ready_to_action",
    score: 74,
    ready_to_action: true,
    hot_lead: false,
    manual_review_required: false,
    company: {
      name: "Acme Corp",
      domain: "acme.com",
      industry: "Software empresarial",
      country: "Estados Unidos",
    },
    lead: {
      full_name: "Robert Chen",
      title: "VP de Revenue Operations",
      email: "rchen@acme.com",
      seniority: "vp",
      linkedin_url: null,
    },
    signal: {
      id: "22222222-2222-2222-2222-222222222222",
      signal_type: "leadership_change",
      title: "Acme Corp contrató a un nuevo VP de Revenue Operations",
      description: "Ex-líder de Datadog se suma para construir la función de RevOps.",
      score: 74,
      detected_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      tags: ["hiring", "vp of"],
    },
    strategy: {
      pain_point:
        "Acme Corp acaba de sumar a un nuevo VP de Revenue Operations. Los nuevos ejecutivos suelen pasar sus primeros 90 días auditando proveedores, procesos y herramientas actuales — y tomando decisiones de reemplazo. Con quienes se reúnen temprano moldean su idea de 'cómo se ve lo bueno'.",
      closing_argument:
        "Noté que Acme Corp recibió recientemente a un nuevo VP de Revenue Operations. La mayoría de los líderes de RevOps en esa posición hacen una auditoría tecnológica completa en su primer trimestre — ayudamos a varios de ellos a construir un stack de inteligencia moderno desde cero. ¿Valdría la pena una llamada para compartir qué está funcionando para otros en tu sector?",
      timing_window: {
        urgency: "this_week",
        reason:
          "Los primeros 30-60 días de un nuevo rol de liderazgo son la fase de 'hoja en blanco' — sin lealtad a proveedores, alta receptividad y evaluación activa de herramientas.",
        expires_at: "90 días desde la contratación",
      },
      playbook: "leadership_change_outreach",
      next_best_action: "reach_out",
      channel: "linkedin",
      rationale: "Puntaje de señal 74/100 — Acme Corp / VP de Revenue Operations.",
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

export const sampleBattlecards: Battlecard[] = [...baseSampleBattlecards, ...historicalBattlecards];

export const sampleArtifacts: ArtifactBundle[] = [
  {
    opportunity_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    generated_at: new Date().toISOString(),
    generator: "rule_based_artifacts",
    email_draft: {
      artifact_type: "email_draft",
      subject: "Pregunta rápida — felicitaciones por la financiación",
      body: `Hola Alice,

Felicitaciones por la Serie B — las empresas en esta etapa suelen necesitar 2-3× su capacidad de go-to-market en los próximos 90 días. Ayudamos a equipos del tamaño de Northwind a lograr exactamente eso sin la penalización habitual del tiempo de ramp-up. ¿Tendría sentido una llamada de 20 minutos esta semana?

Saludos,
[Tu nombre]`,
      ps_line: "P.D. La ventana de timing acá es de 60 días desde el cierre de la financiación — vale la pena una charla rápida antes de eso.",
      recommended_send_time: "Martes–jueves, 8–10 AM hora local del destinatario",
      estimated_read_time_seconds: 30,
    },
    meeting_structure: {
      artifact_type: "meeting_structure",
      meeting_title: "BEE × Northwind Labs — Llamada de descubrimiento",
      total_duration_minutes: 20,
      objective: "Calificar a Northwind Labs como un buen fit y establecer un próximo paso claro antes de que cierre la ventana de 60 días post-financiación.",
      agenda_items: [
        { duration_minutes: 3, title: "Rapport y contexto", notes: "Referenciar su reciente noticia de Serie B." },
        { duration_minutes: 5, title: "Descubrimiento: entender su dolor actual", notes: "Indagar sobre: paradoja del scale-up y desafíos de despliegue de capital." },
        { duration_minutes: 7, title: "Nuestra propuesta de valor (específica a la señal)", notes: "Conectarla directamente con lo escuchado en el descubrimiento." },
        { duration_minutes: 3, title: "Próximos pasos y cronograma", notes: "Apuntar a un compromiso claro antes del día 60." },
        { duration_minutes: 2, title: "Preguntas y cierre", notes: null },
      ],
      pre_meeting_prep: [
        "Revisar el reciente anuncio de Serie B de Northwind Labs.",
        "Investigar el perfil de la VP de Ventas y su actividad en LinkedIn.",
        "Preparar 2–3 casos de éxito de empresas en una etapa post-financiación similar.",
        "Tener clara la respuesta de BEE a: '¿Por qué ahora, específicamente para Northwind Labs?'",
      ],
      success_criteria: "La VP de Ventas comparte su principal desafío y acepta una reunión de seguimiento o prueba dentro de la semana.",
    },
    next_steps: {
      artifact_type: "next_steps",
      horizon: "Próximos 7 días",
      actions: [
        { action: "Enviar el borrador de email a Northwind Labs", owner: "rep", timing: "dentro de 24h", priority: "high" },
        { action: "Conectar en LinkedIn e interactuar con su publicación reciente (calentar el lead)", owner: "rep", timing: "el mismo día del email", priority: "medium" },
        { action: "Investigar a Northwind Labs a fondo — noticias recientes, stack tecnológico, tamaño del equipo", owner: "rep", timing: "antes de enviar el email", priority: "high" },
        { action: "Si no hay respuesta en 3 días: hacer seguimiento con un caso de éxito relevante", owner: "rep", timing: "3 días después del primer contacto", priority: "medium" },
        { action: "Registrar todos los contactos en el CRM con etiquetas de resultado para el loop de aprendizaje de BEE", owner: "rep", timing: "después de cada interacción", priority: "medium" },
        { action: "Plazo límite: debe haber conversación iniciada antes de los 60 días post-financiación", owner: "rep", timing: "60 días desde el cierre de financiación", priority: "high" },
      ],
      key_risk: "Que un competidor los contacte primero. Ventana de timing: las decisiones de asignación de presupuesto se toman en los primeros 60 días después del cierre de la Serie B.",
      success_milestone: "Primera reunión agendada con un decisor en Northwind Labs.",
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
