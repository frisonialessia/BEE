/**
 * The 7-step content for the guided tour — shared between the real
 * dashboard and the /probar sandbox, since both use the same nav rail
 * (DashboardRail with groups swapped, see dashboard-rail.tsx) and tell
 * the same product story. Order is deliberate — the same "detect →
 * prioritize → act → predict" arc the old static onboarding list used,
 * plus the three areas that make BEE more than a CRM (Priorización's
 * Bandeja de Decisiones, Dark Funnel, Pronóstico) that a first click
 * through the nav rail would never surface on its own.
 *
 * Title/description text lives in messages/{locale}/onboarding.json under
 * `tour.steps.*` — this is a plain function, not a component, so it can't
 * call `useTranslations()` itself; every caller gets its own translator via
 * `useTranslations("onboarding.tour.steps")` and passes it in.
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

/** `t` — a translator scoped to `onboarding.tour.steps` (i.e. the result of
 * `useTranslations("onboarding.tour.steps")`). */
export function buildTourSteps(mode: TourMode, t: (key: string) => string): TourStep[] {
  const base = mode === "dashboard" ? "/dashboard" : "/probar";

  const middleSteps: TourStep[] = [
    {
      target: `${base}/signals`,
      href: `${base}/signals`,
      title: t("signals.title"),
      description: t("signals.description"),
      placement: "right",
    },
    {
      // Priorización merged into Señales as a second tab (see
      // signals-dashboard.tsx) — target must match the actual nav rail
      // item (data-tour={href} in nav-items.ts) for the highlight to find
      // it; href still deep-links to the right tab.
      target: `${base}/signals`,
      href: `${base}/signals?tab=priority`,
      title: t("priority.title"),
      description: t("priority.description"),
      placement: "right",
    },
    {
      target: `${base}/crm`,
      href: `${base}/crm`,
      title: t("pipeline.title"),
      description: t("pipeline.description"),
      placement: "right",
    },
    {
      target: `${base}/strategies`,
      href: `${base}/strategies`,
      title: t("strategy.title"),
      description: t("strategy.description"),
      placement: "right",
    },
    {
      // Dark Funnel lives inside Señales now (tab Intención); the rail link is Señales.
      target: `${base}/signals`,
      href: `${base}/signals?tab=intent`,
      title: t("darkFunnel.title"),
      description: t("darkFunnel.description"),
      placement: "right",
    },
    {
      target: `${base}/forecast`,
      href: `${base}/forecast`,
      title: t("forecast.title"),
      description: t("forecast.description"),
      placement: "right",
    },
  ];

  const closingStep: TourStep =
    mode === "dashboard"
      ? {
          target: ACCOUNT_MENU_TARGET,
          href: null,
          title: t("closingDashboard.title"),
          description: t("closingDashboard.description"),
          placement: "left",
        }
      : {
          target: CREATE_ACCOUNT_TARGET,
          href: null,
          title: t("closingProbar.title"),
          description: t("closingProbar.description"),
          placement: "left",
        };

  return [...middleSteps, closingStep];
}
