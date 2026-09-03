/**
 * The 7-step content for the guided tour — shared between the real
 * dashboard and the /probar sandbox, since both use the same nav rail
 * (DashboardRail with groups swapped, see dashboard-rail.tsx) and tell
 * the same product story. Order is deliberate — the same "detect →
 * prioritize → act → predict" arc the old static onboarding list used,
 * plus the three areas that make BEE more than a CRM (Priorización's
 * Bandeja de Decisiones, Dark Funnel, Pronóstico) that a first click
 * through the nav rail would never surface on its own.
 */

export interface TourStep {
  /** Matches the data-tour attribute on the element this step highlights
   * — a nav rail link's own href for the six nav steps, or a fixed id for
   * the closing step's chrome element (account menu / "Crear cuenta"). */
  target: string;
  /** Navigate here before highlighting, when not already on this page.
   * null = the target is always-present chrome (header), no navigation
   * needed regardless of current route. */
  href: string | null;
  title: string;
  description: string;
  /** Which side of the target the tooltip prefers — the rail sits on the
   * left edge, so every nav step points right; the closing step's target
   * sits in the top-right header, so it points left instead. */
  placement: "right" | "left";
}

export type TourMode = "dashboard" | "probar";

const ACCOUNT_MENU_TARGET = "tour-account-menu";
const CREATE_ACCOUNT_TARGET = "tour-create-account";

export function buildTourSteps(mode: TourMode): TourStep[] {
  const base = mode === "dashboard" ? "/dashboard" : "/probar";

  const middleSteps: TourStep[] = [
    {
      target: `${base}/signals`,
      href: `${base}/signals`,
      title: "1. Señales",
      description:
        "Todo arranca acá: lo que el mercado ya hizo público — una ronda, una contratación clave, un cambio de stack — antes de que nadie más lo note.",
      placement: "right",
    },
    {
      // Priorización merged into Señales as a second tab (see
      // signals-dashboard.tsx) — target must match the actual nav rail
      // item (data-tour={href} in nav-items.ts) for the highlight to find
      // it; href still deep-links to the right tab.
      target: `${base}/signals`,
      href: `${base}/signals?tab=priority`,
      title: "2. Priorización",
      description:
        "La Bandeja de Decisiones cruza esas señales con qué tan bien encajan con tu ICP — para saber en cuál entrar primero, no perseguirlas todas por igual.",
      placement: "right",
    },
    {
      target: `${base}/crm`,
      href: `${base}/crm`,
      title: "3. Pipeline (CRM)",
      description:
        'Cada oportunidad ya priorizada vive acá, en 5 etapas: Detectadas → Listas para actuar → Tu prioridad → En conversación → Cerradas. No son las de un CRM genérico ("Nuevo, Abierto...") — cada columna tiene su propio ícono "?" con lo que significa. Arrastrá una tarjeta para avanzarla.',
      placement: "right",
    },
    {
      target: `${base}/strategies`,
      href: `${base}/strategies`,
      title: "4. Estrategia",
      description:
        "Abrí una oportunidad y mirá la jugada que armó la IA: el argumento, el canal, el email — listo para mandar, no un molde genérico.",
      placement: "right",
    },
    {
      target: `${base}/dark-funnel`,
      href: `${base}/dark-funnel`,
      title: "5. Dark Funnel",
      description:
        "Intención de compra que nadie más ve: visitas anónimas, comparativas, investigación silenciosa — antes de que levanten la mano.",
      placement: "right",
    },
    {
      target: `${base}/forecast`,
      href: `${base}/forecast`,
      title: "6. Pronóstico",
      description:
        "Qué va a cerrar este mes y qué está en riesgo — calculado desde el pipeline real, no una planilla aparte que alguien tiene que actualizar a mano.",
      placement: "right",
    },
  ];

  const closingStep: TourStep =
    mode === "dashboard"
      ? {
          target: ACCOUNT_MENU_TARGET,
          href: null,
          title: "7. Tu equipo",
          description:
            "Desde acá invitás a tu equipo a colaborar en el mismo pipeline, cada quien con la visibilidad que le toca según su rol.",
          placement: "left",
        }
      : {
          target: CREATE_ACCOUNT_TARGET,
          href: null,
          title: "7. Es tu turno",
          description:
            "Esto era una vuelta rápida con datos de ejemplo. Creá tu cuenta gratis para conectar tus propias señales y ver a BEE trabajar con tu pipeline real.",
          placement: "left",
        };

  return [...middleSteps, closingStep];
}
