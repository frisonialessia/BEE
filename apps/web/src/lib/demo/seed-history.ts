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
 *
 * Localización: `SEEDS`/`AMBIENT_SIGNAL_DEFS` store their narrative fields
 * (industry, country, lead title, per-signal-type templates) in Spanish as
 * the single canonical source — `LOCALIZED` below translates every one of
 * them into English, keyed off the exact same strings, so nothing can drift
 * between the two languages independently. `historicalSignals`/
 * `historicalOpportunities`/`historicalBattlecards` all now take a
 * `Locale` and build the requested language on demand rather than being
 * precomputed once; see `lib/demo/store.ts` for where that locale comes
 * from (the `NEXT_LOCALE` cookie, via `getDemoLocale()`).
 */
import { defaultLocale, type Locale } from "@/i18n/locales";
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

/** Matches lib/demo/store.ts's `slugify` exactly — company identity in this
 * demo is a name-derived key, not a real row, so both files must derive it
 * the same way for a Signal's `company_id` to line up with an
 * Opportunity's. Company/lead/domain names are proper nouns — not
 * translated between locales, same convention real product demos follow. */
function companySlug(name: string): string {
  return `demo-company-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || "demo"}`;
}

interface Template {
  painPoint: (company: string) => string;
  closingArgument: (company: string) => string;
  playbook: string;
  channel: string;
  signalTitle: (company: string) => string;
  signalDescription: string;
}

const TEMPLATES_ES: Record<SignalType, Template> = {
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
  franchise_expansion: {
    painPoint: (c) => `${c} está abriendo nuevas sucursales — cada ubicación nueva necesita repetir el mismo proceso comercial desde cero, y sin un sistema central, la calidad de cada apertura depende de quién esté a cargo ese día.`,
    closingArgument: (c) => `Vimos que ${c} está expandiendo su red de sucursales — vale la pena una llamada de 15 minutos para ver cómo estandarizar el proceso comercial en cada apertura nueva.`,
    playbook: "franchise_expansion_outreach",
    channel: "email",
    signalTitle: (c) => `${c} abrió una nueva sucursal`,
    signalDescription: "Nueva ubicación o franquicia anunciada — presupuesto de apertura activo.",
  },
  merger_acquisition: {
    painPoint: (c) => `${c} está en medio de una fusión o adquisición — la entidad combinada tiene que decidir qué herramientas de cada lado se quedan, y esa decisión se toma rápido y una sola vez.`,
    closingArgument: (c) => `Vimos el movimiento corporativo de ${c} — las consolidaciones como esta abren una ventana corta para ganar el gasto combinado antes de que el nuevo stack quede fijo.`,
    playbook: "post_merger_consolidation_outreach",
    channel: "email",
    signalTitle: (c) => `${c} anunció una fusión o adquisición`,
    signalDescription: "Movimiento corporativo detectado — revisión de proveedores heredados en curso.",
  },
  public_tender: {
    painPoint: (c) => `${c} ganó una licitación pública con fecha de entrega fija y presupuesto ya aprobado — cumplir ese cronograma con procesos genéricos suele quedar corto.`,
    closingArgument: (c) => `Vimos que ${c} ganó una licitación reciente — vale la pena ver si podemos ayudar a cumplir el cronograma sin fricciones.`,
    playbook: "public_tender_outreach",
    channel: "email",
    signalTitle: (c) => `${c} ganó una licitación pública`,
    signalDescription: "Adjudicación pública detectada — presupuesto aprobado con plazo fijo.",
  },
  regulatory_change: {
    painPoint: (c) => `Un cambio regulatorio está forzando a ${c} a adaptar procesos en un plazo de cumplimiento fijo — a diferencia de una compra por roadmap propio, esta decisión no es opcional.`,
    closingArgument: (c) => `Vimos que el nuevo marco regulatorio afecta a ${c} — vale la pena entender si estamos alineados antes de la fecha límite de cumplimiento.`,
    playbook: "regulatory_compliance_outreach",
    channel: "email",
    signalTitle: (c) => `Nueva regulación afecta el sector de ${c}`,
    signalDescription: "Cambio regulatorio detectado — plazo de cumplimiento con fecha fija.",
  },
  funding_grant: {
    painPoint: (c) => `${c} recibió un fondo público o subvención con presupuesto etiquetado y requisitos de reporte — ese tipo de fondo suele exigir justo la inversión que todavía no tienen resuelta.`,
    closingArgument: (c) => `Vimos que ${c} recibió financiamiento de un fondo público — vale la pena ver si encajamos con lo que el fondo exige antes de que se cierre el período de ejecución.`,
    playbook: "funding_grant_outreach",
    channel: "email",
    signalTitle: (c) => `${c} recibió un fondo de financiamiento`,
    signalDescription: "Subvención o fondo público otorgado — presupuesto etiquetado con plazo de ejecución.",
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

const TEMPLATES_EN: Record<SignalType, Template> = {
  funding_round: {
    painPoint: (c) => `${c} just raised a round and now has to scale go-to-market faster than its current processes can keep up with.`,
    closingArgument: (c) => `Congrats to ${c} on the round — this is exactly the moment when prioritizing the right accounts decides whether that capital pays off in the first quarter.`,
    playbook: "post_funding_outreach",
    channel: "email",
    signalTitle: (c) => `${c} closed a funding round`,
    signalDescription: "Round publicly announced — active budget-allocation window.",
  },
  hiring: {
    painPoint: (c) => `${c} is hiring for sales faster than its current stack can support — every new hire without good signal takes longer to ramp.`,
    closingArgument: (c) => `Saw ${c} growing the sales team — teams growing this fast usually need a prioritization system before hiring pace outruns results.`,
    playbook: "hiring_signal_outreach",
    channel: "linkedin",
    signalTitle: (c) => `${c} opened several sales roles`,
    signalDescription: "Multiple sales/RevOps openings posted in the last few weeks.",
  },
  tech_adoption: {
    painPoint: (c) => `${c} migrated part of its stack recently — that usually surfaces gaps in how market signal connects to the sales team.`,
    closingArgument: (c) => `We noticed ${c} adopted new technology in its stack — that tends to open a short window to review what else in the sales process is worth modernizing at the same time.`,
    playbook: "tech_adoption_outreach",
    channel: "email",
    signalTitle: (c) => `${c} adopted new technology in its stack`,
    signalDescription: "Stack change detected — new integrations visible publicly.",
  },
  leadership_change: {
    painPoint: (c) => `${c}'s new leadership is auditing vendors and tools in their first 90 days — that's when replacement decisions get made.`,
    closingArgument: (c) => `Saw the new leadership hire at ${c} — the first 90 days of a role like that are usually when it's decided what stack stays and what gets replaced.`,
    playbook: "leadership_change_outreach",
    channel: "linkedin",
    signalTitle: (c) => `${c} added new leadership to the sales team`,
    signalDescription: "New leadership hire detected from public sources.",
  },
  product_launch: {
    painPoint: (c) => `${c} just launched a new product — that usually triggers a wave of prospecting the team doesn't have a process for yet.`,
    closingArgument: (c) => `Congrats on the launch — ${c} is likely to see a spike in inbound interest worth prioritizing well from day one.`,
    playbook: "product_launch_outreach",
    channel: "email",
    signalTitle: (c) => `${c} launched a new product`,
    signalDescription: "Public launch detected — expected spike in inbound interest.",
  },
  engagement: {
    painPoint: (c) => `${c} has been engaging with category content for weeks — genuine interest, but without a system to capture it in time, it cools off.`,
    closingArgument: (c) => `${c} has been quite active researching the category — worth a conversation before that interest gets diverted to another priority.`,
    playbook: "engagement_outreach",
    channel: "email",
    signalTitle: (c) => `${c} shows sustained research activity`,
    signalDescription: "Multiple interactions with category content in the last few weeks.",
  },
  news_mention: {
    painPoint: (c) => `${c} made the press for its growth — media attention usually brings more inbound than the sales team can qualify by hand.`,
    closingArgument: (c) => `Saw ${c}'s press mention — good moment to make sure the inbound that generates doesn't get lost for lack of prioritization.`,
    playbook: "news_mention_outreach",
    channel: "email",
    signalTitle: (c) => `${c} appeared in recent press coverage`,
    signalDescription: "Media mention detected — possible associated inbound spike.",
  },
  expansion: {
    painPoint: (c) => `${c} is expanding operations — coordinating sales priorities across more teams without a central system is where consistency starts to slip.`,
    closingArgument: (c) => `Good time to talk — ${c} is expanding right when having a shared view of which account to chase first matters most.`,
    playbook: "expansion_outreach",
    channel: "email",
    signalTitle: (c) => `${c} announced operations expansion`,
    signalDescription: "New location or market announced — signals new regional budget.",
  },
  franchise_expansion: {
    painPoint: (c) => `${c} is opening new locations — every new site needs to repeat the same sales process from scratch, and without a central system, quality depends on who's running that opening.`,
    closingArgument: (c) => `We saw ${c} expanding its network of locations — worth a 15-minute call to see how to standardize the sales process across every new opening.`,
    playbook: "franchise_expansion_outreach",
    channel: "email",
    signalTitle: (c) => `${c} opened a new location`,
    signalDescription: "New location or franchise announced — active opening budget.",
  },
  merger_acquisition: {
    painPoint: (c) => `${c} is going through a merger or acquisition — the combined entity has to decide which tools from each side stay, and that decision gets made fast and once.`,
    closingArgument: (c) => `We saw ${c}'s corporate move — consolidations like this open a short window to win the combined spend before the new stack is locked in.`,
    playbook: "post_merger_consolidation_outreach",
    channel: "email",
    signalTitle: (c) => `${c} announced a merger or acquisition`,
    signalDescription: "Corporate move detected — inherited-vendor review underway.",
  },
  public_tender: {
    painPoint: (c) => `${c} won a public tender with a fixed delivery date and already-approved budget — meeting that timeline with generic processes usually falls short.`,
    closingArgument: (c) => `We saw ${c} won a recent tender — worth seeing if we can help meet the timeline without friction.`,
    playbook: "public_tender_outreach",
    channel: "email",
    signalTitle: (c) => `${c} won a public tender`,
    signalDescription: "Public award detected — approved budget with a fixed deadline.",
  },
  regulatory_change: {
    painPoint: (c) => `A regulatory change is forcing ${c} to adapt processes on a fixed compliance deadline — unlike a discretionary purchase, this decision isn't optional.`,
    closingArgument: (c) => `We saw the new regulatory framework affects ${c} — worth understanding if we're aligned before the compliance deadline.`,
    playbook: "regulatory_compliance_outreach",
    channel: "email",
    signalTitle: (c) => `New regulation affects ${c}'s sector`,
    signalDescription: "Regulatory change detected — compliance deadline with a fixed date.",
  },
  funding_grant: {
    painPoint: (c) => `${c} received a public grant or fund with earmarked budget and reporting requirements — that kind of fund often mandates exactly the investment they haven't made yet.`,
    closingArgument: (c) => `We saw ${c} received funding from a public fund — worth seeing if we fit what the fund requires before the execution period closes.`,
    playbook: "funding_grant_outreach",
    channel: "email",
    signalTitle: (c) => `${c} received a funding grant`,
    signalDescription: "Public grant or fund awarded — earmarked budget with an execution deadline.",
  },
  other: {
    painPoint: (c) => `${c} showed a relevant market signal worth qualifying before it cools off.`,
    closingArgument: (c) => `We saw recent activity from ${c} that suggests this is a good time for a conversation.`,
    playbook: "generic_outreach",
    channel: "email",
    signalTitle: (c) => `Market signal detected at ${c}`,
    signalDescription: "Signal captured by the general detection engine.",
  },
};

const TEMPLATES: Record<Locale, Record<SignalType, Template>> = { es: TEMPLATES_ES, en: TEMPLATES_EN };

/** Industry/country/lead-title strings in `SEEDS` are Spanish (the
 * canonical source); this is the English lookup for every distinct value
 * used there, so a display value only ever needs `translate(x, locale)`. */
const EN_LOOKUP: Record<string, string> = {
  // industries
  "Diseño de producto": "Product design",
  "Logística": "Logistics",
  "Salud digital": "Digital health",
  "Retail": "Retail",
  "Fintech": "Fintech",
  "Manufactura": "Manufacturing",
  "Infraestructura cloud": "Cloud infrastructure",
  "EdTech": "EdTech",
  "LegalTech": "LegalTech",
  "Comercio exterior": "Foreign trade",
  "Salud": "Healthcare",
  "AgTech": "AgTech",
  "PropTech": "PropTech",
  "Medios": "Media",
  "Seguros": "Insurance",
  "Datos / Analytics": "Data / Analytics",
  // countries
  "México": "Mexico",
  "Colombia": "Colombia",
  "Estados Unidos": "United States",
  "Perú": "Peru",
  "Chile": "Chile",
  "Argentina": "Argentina",
  // lead titles
  "Directora Comercial": "Commercial Director",
  "VP de Operaciones": "VP of Operations",
  "CEO": "CEO",
  "Head of Sales": "Head of Sales",
  "VP Revenue Operations": "VP of Revenue Operations",
  "Gerente Comercial": "Sales Manager",
  "VP Sales": "VP of Sales",
  "Directora de Ventas": "Sales Director",
  "Socio Director": "Managing Partner",
  "VP Comercial": "VP of Sales",
  "CRO": "CRO",
  "Gerente General": "General Manager",
  "Director de Ventas": "Sales Director",
  "Head of Revenue": "Head of Revenue",
};

function translate(value: string, locale: Locale): string {
  if (locale === "es") return value;
  return EN_LOOKUP[value] ?? value;
}

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
  /** Only meaningful on an open (non-won/lost) seed — how many days from
   * "now" its `expected_close_date` lands. Pronóstico buckets open pipeline
   * 6 months forward (see lib/forecast.ts's `byMonth`); leaving this unset
   * on every open seed piled all of them into whichever single month sits
   * ~14 days out, so 5 of the 6 forward months rendered empty. Staggered
   * across the 6 open seeds below so the forecast chart shows a real
   * month-over-month distribution instead of one spike. */
  daysUntilClose?: number;
  /** Illustrates the "recalibración de ciclo por señales intermedias"
   * feature (see lib/cycle-prediction.ts): a second, later signal on the
   * same company, detected while this deal was still open. Only set on a
   * handful of closed deals — see the comment above SEEDS for why this is
   * a designed illustration, not a discovered pattern. Keyed by locale
   * since it's hand-written narrative text, not template-generated. */
  intermediateSignal?: { type: SignalType; description: Record<Locale, string> };
}

/**
 * `intermediateSignal` on 6 of the 12 closed deals below illustrates
 * `lib/cycle-prediction.ts`'s signal-recalibration split (a second signal
 * on the same company, detected after the deal opened). This is a
 * DESIGNED illustration, not a discovered market pattern: BEE's actual
 * production data has zero signals and zero opportunities as of this
 * writing (pre-launch), so there is nothing real yet to find this
 * correlation in. The split is deliberately picked as the 6
 * fastest-closing vs. 6 slowest-closing deals among the 12 here, so the
 * mechanic has something concrete to show in the sandbox — the moment
 * BEE has enough live customer history, this demo split becomes
 * unnecessary and the real endpoint takes over unchanged.
 */
const SEEDS: SeedDef[] = [
  { id: "s01", company: "Vantage Studio", domain: "vantagestudio.mx", industry: "Diseño de producto", country: "México", signalType: "funding_round", leadName: "Camila Reyes", leadTitle: "Directora Comercial", seniority: "director", amount: 38000, score: 88, daysAgoCreated: 142, outcome: "won", cycleDays: 34, qualifiedCount: 6, intermediateSignal: { type: "hiring", description: { es: "Vantage Studio abrió una posición comercial mientras evaluaba la propuesta.", en: "Vantage Studio opened a sales role while evaluating the proposal." } } },
  { id: "s02", company: "Río Verde Logística", domain: "rioverdelog.com", industry: "Logística", country: "México", signalType: "expansion", leadName: "Héctor Salinas", leadTitle: "VP de Operaciones", seniority: "vp", amount: 26000, score: 61, daysAgoCreated: 118, outcome: "lost", cycleDays: 52, qualifiedCount: 2, lossReason: "budget", competitor: "HubSpot" },
  { id: "s03", company: "Cumbre Salud", domain: "cumbresalud.co", industry: "Salud digital", country: "Colombia", signalType: "funding_round", leadName: "Valentina Ospina", leadTitle: "CEO", seniority: "c_level", amount: 61000, score: 94, daysAgoCreated: 156, outcome: "won", cycleDays: 28, qualifiedCount: 6, intermediateSignal: { type: "engagement", description: { es: "Cumbre Salud mostró actividad sostenida de investigación mientras el deal seguía abierto.", en: "Cumbre Salud showed sustained research activity while the deal was still open." } } },
  { id: "s04", company: "Bright Retail Co", domain: "brightretail.com", industry: "Retail", country: "Estados Unidos", signalType: "tech_adoption", leadName: "Marcus Webb", leadTitle: "Head of Sales", seniority: "director", amount: 33000, score: 68, daysAgoCreated: 22, outcome: "in_progress", qualifiedCount: 3, daysUntilClose: 155 },
  { id: "s05", company: "Andina Fintech", domain: "andinafintech.pe", industry: "Fintech", country: "Perú", signalType: "leadership_change", leadName: "Rodrigo Paz", leadTitle: "VP Revenue Operations", seniority: "vp", amount: 45000, score: 72, daysAgoCreated: 95, outcome: "lost", cycleDays: 41, qualifiedCount: 3, lossReason: "no_decision", competitor: null },
  { id: "s06", company: "Solaris Manufactura", domain: "solarismfg.mx", industry: "Manufactura", country: "México", signalType: "hiring", leadName: "Patricia León", leadTitle: "Gerente Comercial", seniority: "manager", amount: 19500, score: 65, daysAgoCreated: 130, outcome: "won", cycleDays: 45, qualifiedCount: 5 },
  { id: "s07", company: "Nimbus Cloud Systems", domain: "nimbuscloud.io", industry: "Infraestructura cloud", country: "Estados Unidos", signalType: "product_launch", leadName: "Ashley Turner", leadTitle: "VP Sales", seniority: "vp", amount: 72000, score: 89, daysAgoCreated: 6, outcome: "ready_to_action", qualifiedCount: 5, daysUntilClose: 65 },
  { id: "s08", company: "EduNova", domain: "edunova.mx", industry: "EdTech", country: "México", signalType: "engagement", leadName: "Daniela Cruz", leadTitle: "Directora de Ventas", seniority: "director", amount: 15000, score: 54, daysAgoCreated: 88, outcome: "lost", cycleDays: 22, qualifiedCount: 1, lossReason: "price", competitor: "Salesforce", intermediateSignal: { type: "hiring", description: { es: "EduNova contrató para el área que hubiera usado el producto, a mitad del ciclo.", en: "EduNova hired for the team that would have used the product, midway through the cycle." } } },
  { id: "s09", company: "Horizonte Legal", domain: "horizontelegal.cl", industry: "LegalTech", country: "Chile", signalType: "news_mention", leadName: "Ignacio Fuentes", leadTitle: "Socio Director", seniority: "c_level", amount: 29000, score: 79, daysAgoCreated: 104, outcome: "won", cycleDays: 39, qualifiedCount: 5 },
  { id: "s10", company: "Puerto Digital", domain: "puertodigital.mx", industry: "Comercio exterior", country: "México", signalType: "expansion", leadName: "Sofía Bravo", leadTitle: "VP Comercial", seniority: "vp", amount: 41000, score: 70, daysAgoCreated: 11, outcome: "in_progress", qualifiedCount: 4, daysUntilClose: 95 },
  { id: "s11", company: "Meridian Health Group", domain: "meridianhealth.com", industry: "Salud", country: "Estados Unidos", signalType: "funding_round", leadName: "Jordan Ellis", leadTitle: "CRO", seniority: "c_level", amount: 85000, score: 83, daysAgoCreated: 76, outcome: "lost", cycleDays: 60, qualifiedCount: 3, lossReason: "timing", competitor: null },
  { id: "s12", company: "Terra Agro Analytics", domain: "terraagro.com.ar", industry: "AgTech", country: "Argentina", signalType: "tech_adoption", leadName: "Lucía Fernández", leadTitle: "Gerente General", seniority: "c_level", amount: 24000, score: 66, daysAgoCreated: 112, outcome: "won", cycleDays: 31, qualifiedCount: 5, intermediateSignal: { type: "engagement", description: { es: "Terra Agro Analytics intensificó su investigación de la categoría a mitad del ciclo.", en: "Terra Agro Analytics ramped up its category research midway through the cycle." } } },
  { id: "s13", company: "Vega Real Estate Tech", domain: "vegaretech.mx", industry: "PropTech", country: "México", signalType: "hiring", leadName: "Emilio Duarte", leadTitle: "Director de Ventas", seniority: "director", amount: 18000, score: 47, daysAgoCreated: 2, outcome: "detected", qualifiedCount: 0, daysUntilClose: 12 },
  { id: "s14", company: "Kaizen Manufacturing", domain: "kaizenmfg.com", industry: "Manufactura", country: "Estados Unidos", signalType: "leadership_change", leadName: "Brian Kessler", leadTitle: "VP Sales", seniority: "vp", amount: 52000, score: 71, daysAgoCreated: 68, outcome: "lost", cycleDays: 35, qualifiedCount: 2, lossReason: "product_fit", competitor: "Pipedrive", intermediateSignal: { type: "hiring", description: { es: "Kaizen Manufacturing contrató comercial nuevo mientras evaluaba proveedores.", en: "Kaizen Manufacturing hired a new sales rep while evaluating vendors." } } },
  { id: "s15", company: "Onda Media Group", domain: "ondamedia.mx", industry: "Medios", country: "México", signalType: "product_launch", leadName: "Renata Cabrera", leadTitle: "Directora Comercial", seniority: "director", amount: 22000, score: 75, daysAgoCreated: 90, outcome: "won", cycleDays: 26, qualifiedCount: 4, intermediateSignal: { type: "engagement", description: { es: "Onda Media Group aceleró su evaluación con actividad de investigación adicional.", en: "Onda Media Group sped up its evaluation with additional research activity." } } },
  { id: "s16", company: "Cobre Insurtech", domain: "cobreinsurtech.co", industry: "Seguros", country: "Colombia", signalType: "funding_round", leadName: "Andrés Molina", leadTitle: "VP Growth", seniority: "vp", amount: 47000, score: 77, daysAgoCreated: 16, outcome: "in_progress", qualifiedCount: 4, daysUntilClose: 125 },
  { id: "s17", company: "Silo Data Works", domain: "silodata.io", industry: "Datos / Analytics", country: "Estados Unidos", signalType: "engagement", leadName: "Taylor Brooks", leadTitle: "Head of Revenue", seniority: "director", amount: 39000, score: 81, daysAgoCreated: 145, outcome: "won", cycleDays: 48, qualifiedCount: 6 },
  { id: "s18", company: "Raíz Educación", domain: "raizeducacion.mx", industry: "EdTech", country: "México", signalType: "news_mention", leadName: "Fernanda Ríos", leadTitle: "Gerente Comercial", seniority: "manager", amount: 12500, score: 58, daysAgoCreated: 4, outcome: "ready_to_action", qualifiedCount: 3, daysUntilClose: 40 },
  // s19/s20: two more distinct named competitors, on lost reasons
  // ("price"/"product_fit") that are narratively compatible with "went with
  // a competitor instead" — unlike s05/s11's "no_decision"/"timing" losses,
  // which explicitly mean nobody was chosen, so a competitor name there
  // would contradict the reason itself. Apollo.io and Clay are BEE's actual
  // adjacent category (AI-driven sales intelligence/enrichment), not just
  // more CRMs — see Win/Loss's `Competitors` box, which otherwise skewed
  // toward reading as "competing CRMs" when HubSpot/Salesforce/Pipedrive
  // were the only three examples.
  { id: "s19", company: "Bruma Analytics", domain: "brumaanalytics.com.ar", industry: "Datos / Analytics", country: "Argentina", signalType: "tech_adoption", leadName: "Nicolás Ibarra", leadTitle: "VP Sales", seniority: "vp", amount: 31000, score: 69, daysAgoCreated: 60, outcome: "lost", cycleDays: 33, qualifiedCount: 2, lossReason: "price", competitor: "Apollo.io" },
  { id: "s20", company: "Fenix Wearables", domain: "fenixwearables.com", industry: "Hardware", country: "Estados Unidos", signalType: "engagement", leadName: "Casey Morgan", leadTitle: "Head of GTM", seniority: "director", amount: 27500, score: 63, daysAgoCreated: 44, outcome: "lost", cycleDays: 19, qualifiedCount: 1, lossReason: "product_fit", competitor: "Clay" },
];

const EVALUATION_WINDOW_REASON: Record<Locale, string> = {
  es: "Ventana de evaluación activa",
  en: "Active evaluation window",
};

const SCORE_RATIONALE: Record<Locale, (score: number, company: string, industry: string, country: string) => string> = {
  es: (score, company, industry, country) => `Puntaje de señal ${score}/100 — ${company} (${industry}, ${country}).`,
  en: (score, company, industry, country) => `Signal score ${score}/100 — ${company} (${industry}, ${country}).`,
};

const MID_CYCLE_SIGNAL_TITLE: Record<Locale, (company: string) => string> = {
  es: (c) => `${c}: nueva señal detectada durante el ciclo`,
  en: (c) => `${c}: new signal detected mid-cycle`,
};

const OPPORTUNITY_TITLE_PREFIX: Record<Locale, string> = { es: "Oportunidad: ", en: "Opportunity: " };

function buildStrategy(def: SeedDef, template: Template, createdAtIso: string, locale: Locale): BattlecardStrategy {
  const industry = translate(def.industry, locale);
  const country = translate(def.country, locale);
  return {
    pain_point: template.painPoint(def.company),
    closing_argument: template.closingArgument(def.company),
    timing_window: { urgency: def.outcome === "ready_to_action" ? "immediate" : "this_week", reason: EVALUATION_WINDOW_REASON[locale], expires_at: null },
    playbook: template.playbook,
    next_best_action: "reach_out",
    channel: template.channel,
    rationale: SCORE_RATIONALE[locale](def.score, def.company, industry, country),
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

function buildOriginSignals(locale: Locale): Signal[] {
  const templates = TEMPLATES[locale];
  return SEEDS.map((def) => {
    const template = templates[def.signalType];
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
      company_id: companySlug(def.company),
      lead_id: null,
      analysis: { tags: [def.signalType], analyzers: [def.signalType], primary_analyzer: def.signalType },
    };
  });
}

/** The second signal for each of the 6 deals marked `intermediateSignal`
 * above — detected roughly at the midpoint of the deal's actual cycle, so
 * it always lands strictly inside (created_at, closed_at] regardless of
 * when the sandbox is opened. See the comment above SEEDS for why this
 * split exists and what it is (and isn't) evidence of. */
function buildIntermediateSignals(locale: Locale): Signal[] {
  return SEEDS.filter(
    (def): def is SeedDef & { cycleDays: number; intermediateSignal: NonNullable<SeedDef["intermediateSignal"]> } =>
      def.cycleDays !== undefined && def.intermediateSignal !== undefined,
  ).map((def) => ({
    id: `demo-signal-${def.id}-mid`,
    signal_type: def.intermediateSignal.type,
    source: "webhook",
    title: MID_CYCLE_SIGNAL_TITLE[locale](def.company),
    description: def.intermediateSignal.description[locale],
    score: def.score,
    confidence: 0.65,
    detected_at: daysAgoIso(def.daysAgoCreated - def.cycleDays / 2, 3),
    company_id: companySlug(def.company),
    lead_id: null,
    analysis: { tags: [def.intermediateSignal.type], analyzers: [def.intermediateSignal.type], primary_analyzer: def.intermediateSignal.type },
  }));
}

/** Additional lightweight signals with no linked opportunity — exist purely
 * to give Señales → "Volumen de señales" (a 14-day daily bar chart, see
 * `lib/signal-trends.ts`'s `computeDailySignalVolume`) a realistically
 * populated shape. The 18 SEEDS above are one-off narrative events spread
 * across ~5 months (by design — see the comment above SEEDS: they exist to
 * give Ganado/Perdido, Pronóstico, and cycle-prediction real depth), so on
 * any single day inside the last 14 only 3-4 of them land, leaving most
 * days as empty bars. A real BEE account sees far more raw signals than
 * opportunities — not every signal clears an analyzer's threshold — so
 * these fill that gap honestly: no company_id/lead_id, exactly like a
 * signal that got detected and scored but never became a pipeline entry. */
const AMBIENT_SIGNAL_DEFS: { daysAgo: number; hours: number; type: SignalType; score: number; company: string }[] = [
  { daysAgo: 1, hours: 4, type: "engagement", score: 42, company: "Loop Ventures" },
  { daysAgo: 1, hours: 14, type: "news_mention", score: 55, company: "Faro Robotics" },
  { daysAgo: 2, hours: 9, type: "tech_adoption", score: 61, company: "Delta Insurance Group" },
  { daysAgo: 3, hours: 3, type: "hiring", score: 48, company: "Bloom Wellness" },
  { daysAgo: 5, hours: 11, type: "engagement", score: 39, company: "Cursor Freight" },
  { daysAgo: 6, hours: 20, type: "expansion", score: 53, company: "Norte Payments" },
  { daysAgo: 7, hours: 8, type: "product_launch", score: 60, company: "Alto Analytics" },
  { daysAgo: 8, hours: 15, type: "engagement", score: 44, company: "Vela Biotech" },
  { daysAgo: 9, hours: 2, type: "news_mention", score: 50, company: "Perch HR" },
  { daysAgo: 10, hours: 18, type: "hiring", score: 46, company: "Grano Foods" },
  { daysAgo: 12, hours: 7, type: "tech_adoption", score: 57, company: "Cielo Travel" },
  { daysAgo: 13, hours: 12, type: "engagement", score: 41, company: "Mesa Legal" },
];

function buildAmbientSignals(locale: Locale): Signal[] {
  const templates = TEMPLATES[locale];
  return AMBIENT_SIGNAL_DEFS.map((def, i) => {
    const template = templates[def.type];
    return {
      id: `demo-signal-ambient-${i + 1}`,
      signal_type: def.type,
      source: "webhook",
      title: template.signalTitle(def.company),
      description: template.signalDescription,
      score: def.score,
      confidence: Math.round((def.score / 100) * 0.8 * 100) / 100,
      detected_at: daysAgoIso(def.daysAgo, def.hours),
      company_id: null,
      lead_id: null,
      analysis: { tags: [def.type], analyzers: [def.type], primary_analyzer: def.type },
    };
  });
}

export function historicalSignals(locale: Locale = defaultLocale): Signal[] {
  return [...buildOriginSignals(locale), ...buildIntermediateSignals(locale), ...buildAmbientSignals(locale)];
}

export function historicalOpportunities(locale: Locale = defaultLocale): Opportunity[] {
  const templates = TEMPLATES[locale];
  return SEEDS.map((def) => {
    const template = templates[def.signalType];
    const createdAtIso = daysAgoIso(def.daysAgoCreated, 3);
    const isClosed = def.outcome === "won" || def.outcome === "lost";
    const closedAtIso = isClosed && def.cycleDays ? daysAgoIso(def.daysAgoCreated - def.cycleDays, 3) : null;
    const strategy = hasFullStrategy(def.outcome) ? buildStrategy(def, template, createdAtIso, locale) : {};

    return {
      id: `demo-opp-${def.id}`,
      title: `${OPPORTUNITY_TITLE_PREFIX[locale]}${template.signalTitle(def.company)}`,
      status: statusFor(def.outcome),
      score: def.score,
      strategy,
      signal_id: `demo-signal-${def.id}`,
      lead_id: null,
      company_id: companySlug(def.company),
      assigned_to_user_id: null,
      amount: def.amount,
      expected_close_date: isClosed ? null : dateOnly(daysAgoIso(-(def.daysUntilClose ?? 14))),
      qualification: qualificationWith(def.qualifiedCount),
      created_at: createdAtIso,
      updated_at: closedAtIso ?? createdAtIso,
      loss_reason: def.outcome === "lost" ? (def.lossReason ?? "other") : null,
      competitor: def.competitor ?? null,
      closed_at: closedAtIso,
    };
  });
}

/** Solo las oportunidades suficientemente calificadas (ready_to_action o
 * mejor) tienen battlecard completo — igual que en la app real, donde
 * READY_TO_ACTION es el gate que exige que la estrategia esté enriquecida
 * del todo. Una oportunidad "detected" recién detectada no tiene battlecard
 * todavía, ni en la demo ni en producción. */
export function historicalBattlecards(locale: Locale = defaultLocale): Battlecard[] {
  const templates = TEMPLATES[locale];
  return SEEDS.filter((def) =>
    ["won", "lost", "in_progress", "ready_to_action"].includes(def.outcome),
  ).map((def) => {
    const template = templates[def.signalType];
    const createdAtIso = daysAgoIso(def.daysAgoCreated, 3);
    const strategy = buildStrategy(def, template, createdAtIso, locale);

    return {
      opportunity_id: `demo-opp-${def.id}`,
      title: template.signalTitle(def.company),
      status: statusFor(def.outcome),
      score: def.score,
      ready_to_action: true,
      hot_lead: def.score >= 75,
      manual_review_required: false,
      company: { name: def.company, domain: def.domain, industry: translate(def.industry, locale), country: translate(def.country, locale) },
      lead: { full_name: def.leadName, title: translate(def.leadTitle, locale), email: `${def.leadName.split(" ")[0].toLowerCase()}@${def.domain}`, seniority: def.seniority, linkedin_url: null },
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
}
