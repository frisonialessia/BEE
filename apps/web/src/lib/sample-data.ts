import { defaultLocale, type Locale } from "@/i18n/locales";
import type { ArtifactBundle, Battlecard, Opportunity, Signal } from "@/lib/types";
import { historicalBattlecards, historicalOpportunities, historicalSignals } from "@/lib/demo/seed-history";
import type { HotLeadScore } from "@/types/extended";

/**
 * Illustrative data used when the backend API is not reachable (e.g. static
 * previews / first run before `docker compose up`), and the whole `/probar`
 * sandbox dataset. Keeps the dashboard fully renderable and demonstrates
 * the shape of real Signal Engine + Battlecard output.
 *
 * Localization: every exported constant below is now a `get*(locale)`
 * function instead of a plain array — the base examples (Northwind Labs /
 * Acme Corp) have hand-written Spanish and English versions selected by
 * `locale`; `historicalSignals`/`historicalOpportunities`/
 * `historicalBattlecards` (from `lib/demo/seed-history.ts`) build their own
 * language on demand the same way. See `lib/demo/store.ts` for where the
 * locale comes from (the `NEXT_LOCALE` cookie via `getDemoLocale()`) and
 * why it isn't threaded in as a React value: this module has no component
 * tree to read it from.
 */
const baseSampleSignalsEs: Signal[] = [
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

const baseSampleSignalsEn: Signal[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    signal_type: "funding_round",
    source: "webhook",
    title: "Northwind Labs closed a $32M Series B",
    description: "Led by Sequoia to accelerate EMEA go-to-market.",
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
    title: "Acme Corp hired a new VP of Revenue Operations",
    description: "Ex-Datadog leader joins to build out the RevOps function.",
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
    title: "Globex migrated its data stack to Snowflake",
    description: "New integration references detected on their engineering blog.",
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
    description: "European expansion signaling new regional budgets.",
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
export function getSampleSignals(locale: Locale = defaultLocale): Signal[] {
  return [...(locale === "en" ? baseSampleSignalsEn : baseSampleSignalsEs), ...historicalSignals(locale)];
}

const baseSampleOpportunitiesEs: Opportunity[] = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "Oportunidad: Northwind Labs cerró una Serie B de $32M",
    status: "ready_to_action",
    opportunity_type: "new_logo",
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
    source: null,
    next_meeting_at: null,
    meetings_held_count: 0,
    photo_url: null,
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
    opportunity_type: "new_logo",
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
    source: null,
    next_meeting_at: null,
    meetings_held_count: 0,
    photo_url: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    loss_reason: null,
    competitor: null,
    closed_at: null,
  },
];

const baseSampleOpportunitiesEn: Opportunity[] = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "Opportunity: Northwind Labs closed a $32M Series B",
    status: "ready_to_action",
    opportunity_type: "new_logo",
    score: 92,
    strategy: {
      pain_point: "Post-funding teams need to scale outbound before their 90-day hiring plan stalls.",
      closing_argument:
        "Congrats on the Series B — we help newly funded teams accelerate their pipeline 2x faster in the first quarter.",
      timing_window: { urgency: "immediate" as const, reason: "Budget allocation window", expires_at: "90 days" },
      playbook: "post_funding_outreach",
      next_best_action: "reach_out",
      channel: "email",
      generator: "rule_based",
      generated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      rationale:
        "Northwind Labs recently secured funding — an ideal window to reach out while budgets are being allocated.",
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
    source: null,
    next_meeting_at: null,
    meetings_held_count: 0,
    photo_url: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    loss_reason: null,
    competitor: null,
    closed_at: null,
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    title: "Opportunity: Acme Corp hired a new VP of Revenue Operations",
    status: "ready_to_action",
    opportunity_type: "new_logo",
    score: 74,
    strategy: {
      pain_point: "The new RevOps leader is evaluating the whole sales stack in their first 90 days.",
      closing_argument:
        "Saw you joined as VP of RevOps — teams at your stage often rebuild their pipeline infrastructure in the first quarter.",
      timing_window: { urgency: "this_week" as const, reason: "New-hire evaluation window", expires_at: null },
      playbook: "leadership_change_outreach",
      next_best_action: "reach_out",
      channel: "linkedin",
      generator: "rule_based",
      generated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      rationale:
        "A new RevOps leader is actively making tooling decisions in their first 90 days.",
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
    source: null,
    next_meeting_at: null,
    meetings_held_count: 0,
    photo_url: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    loss_reason: null,
    competitor: null,
    closed_at: null,
  },
];

export function getSampleOpportunities(locale: Locale = defaultLocale): Opportunity[] {
  // The backend marks a hot lead on the opportunity's strategy
  // (POST /signals/intent writes strategy.hot_lead); the battlecard only
  // mirrors it. Keep the sandbox the same way round so the board's star
  // reads the same field the live app does.
  const hot = new Set((locale === "en" ? baseSampleBattlecardsEn : baseSampleBattlecardsEs).filter((b) => b.hot_lead).map((b) => b.opportunity_id));
  return [
    ...(locale === "en" ? baseSampleOpportunitiesEn : baseSampleOpportunitiesEs).map((o) =>
      hot.has(o.id) ? { ...o, strategy: { ...o.strategy, hot_lead: true } } : o,
    ),
    ...historicalOpportunities(locale),
  ];
}

// Sample battlecards (one per opportunity) demonstrating the full CEO brief format.
const baseSampleBattlecardsEs: Battlecard[] = [
  {
    opportunity_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "Northwind Labs cerró una Serie B de $32M",
    status: "ready_to_action",
    opportunity_type: "new_logo",
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
    opportunity_type: "new_logo",
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

const baseSampleBattlecardsEn: Battlecard[] = [
  {
    opportunity_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "Northwind Labs closed a $32M Series B",
    status: "ready_to_action",
    opportunity_type: "new_logo",
    score: 92,
    ready_to_action: true,
    hot_lead: true,
    manual_review_required: false,
    company: {
      name: "Northwind Labs",
      domain: "northwindlabs.com",
      industry: "B2B SaaS",
      country: "United States",
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
      title: "Northwind Labs closed a $32M Series B",
      description: "Led by Sequoia to accelerate EMEA go-to-market.",
      score: 92,
      detected_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
      tags: ["funding", "series b"],
    },
    strategy: {
      pain_point:
        "Northwind Labs just closed a $32M Series B and now faces the classic scale-up paradox: they have capital to invest but their current processes, tools, and team aren't ready for the next growth phase. Every week of delay is a competitive disadvantage.",
      closing_argument:
        "Congrats on the Series B — companies at this stage typically need 2-3x their go-to-market capacity over the next 90 days. We help teams Northwind's size do exactly that without the usual ramp-up time penalty. Would a 20-minute call this week make sense?",
      timing_window: {
        urgency: "immediate",
        reason:
          "Budget allocation decisions get made in the first 60 days after the Series B closes. Vendors who reach out early are 3x more likely to be chosen.",
        expires_at: "60 days from the funding close",
      },
      playbook: "post_funding_outreach",
      next_best_action: "reach_out",
      channel: "email",
      rationale: "Signal score 92/100 — Northwind Labs closed a Series B ($32M). Lead: Alice Mercer.",
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
    opportunity_type: "new_logo",
    score: 74,
    ready_to_action: true,
    hot_lead: false,
    manual_review_required: false,
    company: {
      name: "Acme Corp",
      domain: "acme.com",
      industry: "Enterprise software",
      country: "United States",
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
      description: "Ex-Datadog leader joins to build out the RevOps function.",
      score: 74,
      detected_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      tags: ["hiring", "vp of"],
    },
    strategy: {
      pain_point:
        "Acme Corp just brought on a new VP of Revenue Operations. New executives typically spend their first 90 days auditing current vendors, processes, and tools — and making replacement decisions. Whoever they meet with early shapes their idea of 'what good looks like'.",
      closing_argument:
        "Noticed Acme Corp recently brought on a new VP of Revenue Operations. Most RevOps leaders in that position run a full tech audit in their first quarter — we've helped several of them build a modern intelligence stack from scratch. Worth a call to share what's working for others in your space?",
      timing_window: {
        urgency: "this_week",
        reason:
          "The first 30-60 days of a new leadership role are the 'blank slate' phase — no vendor loyalty, high receptiveness, and active tool evaluation.",
        expires_at: "90 days from the hire",
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

export function getSampleBattlecards(locale: Locale = defaultLocale): Battlecard[] {
  return [
    ...(locale === "en" ? baseSampleBattlecardsEn : baseSampleBattlecardsEs),
    ...historicalBattlecards(locale),
  ];
}

const sampleArtifactsEs: ArtifactBundle[] = [
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

const sampleArtifactsEn: ArtifactBundle[] = [
  {
    opportunity_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    generated_at: new Date().toISOString(),
    generator: "rule_based_artifacts",
    email_draft: {
      artifact_type: "email_draft",
      subject: "Quick question — congrats on the funding",
      body: `Hi Alice,

Congrats on the Series B — companies at this stage typically need 2-3x their go-to-market capacity over the next 90 days. We help teams Northwind's size do exactly that without the usual ramp-up time penalty. Would a 20-minute call this week make sense?

Best,
[Your name]`,
      ps_line: "P.S. The timing window here is 60 days from the funding close — worth a quick chat before then.",
      recommended_send_time: "Tuesday–Thursday, 8–10 AM recipient local time",
      estimated_read_time_seconds: 30,
    },
    meeting_structure: {
      artifact_type: "meeting_structure",
      meeting_title: "BEE × Northwind Labs — Discovery call",
      total_duration_minutes: 20,
      objective: "Qualify Northwind Labs as a good fit and establish a clear next step before the 60-day post-funding window closes.",
      agenda_items: [
        { duration_minutes: 3, title: "Rapport and context", notes: "Reference their recent Series B news." },
        { duration_minutes: 5, title: "Discovery: understand their current pain", notes: "Probe on: scale-up paradox and capital-deployment challenges." },
        { duration_minutes: 7, title: "Our value proposition (signal-specific)", notes: "Connect it directly to what came up in discovery." },
        { duration_minutes: 3, title: "Next steps and timeline", notes: "Aim for a clear commitment before day 60." },
        { duration_minutes: 2, title: "Questions and close", notes: null },
      ],
      pre_meeting_prep: [
        "Review Northwind Labs' recent Series B announcement.",
        "Research the VP of Sales' profile and LinkedIn activity.",
        "Prepare 2-3 success stories from companies at a similar post-funding stage.",
        "Have a clear answer for BEE's 'Why now, specifically for Northwind Labs?'",
      ],
      success_criteria: "The VP of Sales shares their top challenge and agrees to a follow-up meeting or trial within the week.",
    },
    next_steps: {
      artifact_type: "next_steps",
      horizon: "Next 7 days",
      actions: [
        { action: "Send the email draft to Northwind Labs", owner: "rep", timing: "within 24h", priority: "high" },
        { action: "Connect on LinkedIn and engage with their recent post (warm up the lead)", owner: "rep", timing: "same day as the email", priority: "medium" },
        { action: "Research Northwind Labs thoroughly — recent news, tech stack, team size", owner: "rep", timing: "before sending the email", priority: "high" },
        { action: "If no response in 3 days: follow up with a relevant success story", owner: "rep", timing: "3 days after first contact", priority: "medium" },
        { action: "Log every touchpoint in the CRM with outcome tags for BEE's learning loop", owner: "rep", timing: "after each interaction", priority: "medium" },
        { action: "Deadline: conversation must be started before 60 days post-funding", owner: "rep", timing: "60 days from the funding close", priority: "high" },
      ],
      key_risk: "A competitor reaching out first. Timing window: budget allocation decisions get made in the first 60 days after the Series B closes.",
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

export function getSampleArtifacts(locale: Locale = defaultLocale): ArtifactBundle[] {
  return locale === "en" ? sampleArtifactsEn : sampleArtifactsEs;
}

const namedHotLeadsEs: HotLeadScore[] = [
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
];

// English variant is byte-identical to the Spanish one — every field here
// is already language-neutral (proper nouns, buying-stage enum values,
// intent keywords in English by convention). Kept as its own export rather
// than reusing namedHotLeadsEs directly so a future change to one language
// doesn't silently also change the other.
const namedHotLeadsEn: HotLeadScore[] = namedHotLeadsEs.map((lead) => ({ ...lead }));

// The rest of the hive: the same companies the sandbox uses everywhere
// else (Empresas, CRM, Señales), never a "Company 7" — a demo that names
// accounts the visitor already met reads as one product, not as filler.
const HIVE_COMPANIES: { name: string; domain: string }[] = [
  { name: "Río Verde Logística", domain: "rioverdelog.com" },
  { name: "Cumbre Salud", domain: "cumbresalud.co" },
  { name: "Bright Retail Co", domain: "brightretail.com" },
  { name: "Andina Fintech", domain: "andinafintech.pe" },
  { name: "Solaris Manufactura", domain: "solarismfg.mx" },
  { name: "Nimbus Cloud Systems", domain: "nimbuscloud.io" },
  { name: "EduNova", domain: "edunova.mx" },
  { name: "Horizonte Legal", domain: "horizontelegal.cl" },
  { name: "Puerto Digital", domain: "puertodigital.mx" },
  { name: "Meridian Health Group", domain: "meridianhealth.com" },
  { name: "Terra Agro Analytics", domain: "terraagro.com.ar" },
  { name: "Vega Real Estate Tech", domain: "vegaretech.mx" },
  { name: "Kaizen Manufacturing", domain: "kaizenmfg.com" },
  { name: "Onda Media Group", domain: "ondamedia.mx" },
  { name: "Cobre Insurtech", domain: "cobreinsurtech.co" },
  { name: "Silo Data Works", domain: "silodata.io" },
  { name: "Raíz Educación", domain: "raizeducacion.mx" },
  { name: "Vantage Studio", domain: "vantagestudio.mx" },
  { name: "Bruma Analytics", domain: "brumaanalytics.com.ar" },
  { name: "Fenix Wearables", domain: "fenixwearables.com" },
];

// Intent keywords in English by convention (what the crawler sees on the
// web), rotated so the "Qué investigan" box has a real distribution.
const HIVE_KEYWORDS = [
  ["pricing", "sales intelligence"],
  ["crm integration", "api docs"],
  ["intent data", "lead scoring"],
  ["competitor compare", "pricing"],
  ["case study", "security review"],
  ["demo", "onboarding"],
  ["lead scoring", "pricing"],
  ["intent data", "competitor compare"],
];

const HIVE_SIGNAL_TYPES = [["search"], ["search", "pricing_view"], ["pricing_view", "demo_watch"], ["competitor_compare"], ["review_visit", "search"], ["docs_visit"]];

function genericHotLeads(): HotLeadScore[] {
  return HIVE_COMPANIES.map((c, i) => ({
    id: `h-gen-${i}`,
    company_domain: c.domain,
    company_name: c.name,
    lead_id: null,
    research_intensity_score: 20 + ((i * 17) % 75),
    buying_stage: (["awareness", "consideration", "decision", "ready_to_buy"] as const)[i % 4],
    signal_count: 1 + (i % 6),
    signal_types_seen: HIVE_SIGNAL_TYPES[i % HIVE_SIGNAL_TYPES.length],
    top_intent_keywords: HIVE_KEYWORDS[i % HIVE_KEYWORDS.length],
    last_signal_at: new Date(Date.now() - i * 3600000).toISOString(),
    is_hot: i % 5 === 0,
    hot_since: i % 5 === 0 ? new Date().toISOString() : null,
    alerted: false,
    created_at: new Date().toISOString(),
  }));
}

export function getSampleHotLeads(locale: Locale = defaultLocale): HotLeadScore[] {
  return [...(locale === "en" ? namedHotLeadsEn : namedHotLeadsEs), ...genericHotLeads()];
}

/** @deprecated Use `getSampleSignals(locale)` — kept as the Spanish-default
 * static export only for any straggling import not yet migrated; every
 * in-repo caller has been (see lib/api.ts, lib/api/opportunities.ts,
 * lib/demo/store.ts). */
export const sampleSignals: Signal[] = getSampleSignals("es");
/** @deprecated Use `getSampleOpportunities(locale)`. */
export const sampleOpportunities: Opportunity[] = getSampleOpportunities("es");
/** @deprecated Use `getSampleBattlecards(locale)`. */
export const sampleBattlecards: Battlecard[] = getSampleBattlecards("es");
/** @deprecated Use `getSampleArtifacts(locale)`. */
export const sampleArtifacts: ArtifactBundle[] = getSampleArtifacts("es");
/** @deprecated Use `getSampleHotLeads(locale)`. */
export const sampleHotLeads: HotLeadScore[] = getSampleHotLeads("es");
