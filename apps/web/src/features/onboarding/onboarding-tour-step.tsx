"use client";

import { Compass, KanbanSquare, Lightbulb, Radio, TrendingUp, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildTourSteps } from "@/features/tour/tour-steps";
import { useTour } from "@/features/tour/tour-context";

/** Just a preview of what the interactive tour covers — not itself
 * clickable, unlike the old version of this step (four links straight to
 * each page). The real thing is `<TourOverlay>` (features/tour): it
 * highlights the actual nav rail item on the actual page, page by page,
 * with Siguiente/Atrás — see tour-steps.ts for why this order. */
const PREVIEW: { icon: LucideIcon; key: string }[] = [
  { icon: Radio, key: "signals" },
  { icon: Compass, key: "darkFunnel" },
  { icon: Lightbulb, key: "strategy" },
  { icon: KanbanSquare, key: "pipeline" },
  { icon: TrendingUp, key: "forecast" },
];

export function OnboardingTourStep({ onDone }: { onDone: () => void }) {
  const { start } = useTour();
  const t = useTranslations("onboarding.intro.tourPreview");
  const tTour = useTranslations("onboarding.tour");

  function startGuidedTour() {
    // Close the intro dialog first — the tour overlay renders in the same
    // shell layout, right on top of the dashboard itself, so the two would
    // otherwise stack.
    onDone();
    start(buildTourSteps("dashboard", (key) => tTour(`steps.${key}` as "steps.signals.title")));
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="bee-display text-xl">{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PREVIEW.map(({ icon: Icon, key }) => (
          <li
            key={key}
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-divider)] px-3 py-2"
          >
            <Icon className="size-3.5 shrink-0 stroke-[1.5] text-[var(--color-text)]" />
            <span className="truncate text-xs font-medium">{t(`preview.${key}` as "preview.signals")}</span>
          </li>
        ))}
      </ul>

      <DialogFooter className="mt-4 gap-2 sm:gap-2">
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          {t("notNow")}
        </button>
        <button type="button" onClick={startGuidedTour} className="bee-btn bee-btn--primary">
          {t("start")}
        </button>
      </DialogFooter>
    </>
  );
}
