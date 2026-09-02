"use client";

import { Compass, KanbanSquare, Lightbulb, Radio, TrendingUp, Users, type LucideIcon } from "lucide-react";

import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildTourSteps } from "@/features/tour/tour-steps";
import { useTour } from "@/features/tour/tour-context";

/** Just a preview of what the interactive tour covers — not itself
 * clickable, unlike the old version of this step (four links straight to
 * each page). The real thing is `<TourOverlay>` (features/tour): it
 * highlights the actual nav rail item on the actual page, page by page,
 * with Siguiente/Atrás — see tour-steps.ts for why this order. */
const PREVIEW: { icon: LucideIcon; label: string }[] = [
  { icon: Radio, label: "Señales" },
  { icon: Compass, label: "Priorización" },
  { icon: KanbanSquare, label: "Pipeline" },
  { icon: Lightbulb, label: "Estrategia" },
  { icon: TrendingUp, label: "Pronóstico" },
  { icon: Users, label: "Equipo" },
];

export function OnboardingTourStep({ onDone }: { onDone: () => void }) {
  const { start } = useTour();

  function startGuidedTour() {
    // Close the intro dialog first — the tour overlay renders in the same
    // shell layout, right on top of the dashboard itself, so the two would
    // otherwise stack.
    onDone();
    start(buildTourSteps("dashboard"));
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="bee-display text-xl">Así funciona BEE</DialogTitle>
        <DialogDescription>
          Un recorrido guiado de 7 pasos, directo sobre el producto — te vamos mostrando cada
          lugar clave a medida que avanzás, en el orden que tiene sentido para tu primera vuelta.
        </DialogDescription>
      </DialogHeader>

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PREVIEW.map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-divider)] px-2.5 py-2"
          >
            <Icon className="size-3.5 shrink-0 stroke-[1.5] text-[var(--color-chart-4)]" />
            <span className="truncate text-xs font-medium">{label}</span>
          </li>
        ))}
      </ul>

      <DialogFooter className="mt-4 gap-2 sm:gap-2">
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          Ahora no
        </button>
        <button type="button" onClick={startGuidedTour} className="bee-btn bee-btn--primary">
          Empezar el tour guiado
        </button>
      </DialogFooter>
    </>
  );
}
