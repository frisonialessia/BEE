"use client";

import { Compass, KanbanSquare, Lightbulb, Radio, TrendingUp, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useTour } from "@/features/tour/tour-context";
import { buildTourSteps, type TourMode } from "@/features/tour/tour-steps";

const STORAGE_KEY = "bee_tour_intro_seen_v1";

// Same 5 tools and icons as OnboardingTourStep's own preview (the real
// dashboard's wizard) — one decision, shown consistently wherever the
// tour is offered.
const PREVIEW: { icon: LucideIcon; key: string }[] = [
  { icon: Radio, key: "signals" },
  { icon: Compass, key: "darkFunnel" },
  { icon: Lightbulb, key: "strategy" },
  { icon: KanbanSquare, key: "pipeline" },
  { icon: TrendingUp, key: "forecast" },
];

/**
 * Auto-offer for a first-time visitor — replaces an always-on header
 * button that permanently spent header space on every visit, returning
 * or not. Shown once per browser (localStorage, same "seen it" pattern as
 * the real dashboard's OnboardingIntro) as a modest card anchored near
 * the bottom of the screen, not a full centered Dialog — this only ever
 * offers the one thing (start the tour, or don't), never a form.
 */
export function TourIntroPopup({ mode }: { mode: TourMode }) {
  const { start } = useTour();
  const t = useTranslations("onboarding.intro.tourPreview");
  const tTour = useTranslations("onboarding.tour");
  const [dismissed, setDismissed] = useState(false);
  const [alreadySeen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return Boolean(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      // Storage unavailable — treat as "already seen" rather than risk
      // popping this up on every single reload for that visitor.
      return true;
    }
  });

  function markSeen() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Not persisting across reloads isn't worth an error here either.
    }
    setDismissed(true);
  }

  function startTour() {
    markSeen();
    start(buildTourSteps(mode, (key) => tTour(`steps.${key}` as "steps.signals.title")));
  }

  if (alreadySeen || dismissed) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-40 flex justify-center sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2">
      <div className="bee-glass w-full max-w-sm rounded-[var(--radius-lg)] p-4 shadow-lg">
        <p className="bee-card-title">{t("title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {PREVIEW.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-center gap-1.5 rounded-full border border-[var(--color-divider)] px-2.5 py-1">
              <Icon className="size-3 shrink-0 stroke-[1.5] text-[var(--color-text)]" />
              <span className="truncate text-xs font-medium">{t(`preview.${key}` as "preview.signals")}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={markSeen} className="bee-btn-ghost px-3 py-1.5 text-xs">
            {t("notNow")}
          </button>
          <button type="button" onClick={startTour} className="bee-btn bee-btn--primary px-3 py-1.5 text-xs">
            {t("start")}
          </button>
        </div>
      </div>
    </div>
  );
}
