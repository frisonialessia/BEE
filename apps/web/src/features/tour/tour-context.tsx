"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { TourStep } from "@/features/tour/tour-steps";

interface TourContextValue {
  active: boolean;
  step: TourStep | null;
  stepIndex: number;
  totalSteps: number;
  start: (steps: TourStep[]) => void;
  next: () => void;
  back: () => void;
  stop: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

/**
 * Guided product tour — engine only, no visual output of its own. Mounted
 * once per shell layout (dashboard/probar layout.tsx) so it survives
 * client-side navigation between steps that live on different pages —
 * the whole point versus the old static "Así funciona BEE" modal, which
 * just listed four links to click later and forgot about you the moment
 * you clicked one.
 *
 * See tour-overlay.tsx for the actual highlight-ring + tooltip renderer
 * (reads this context, does the DOM measuring) and tour-steps.ts for the
 * 7-step content both the dashboard and the /probar sandbox share.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(false);

  const start = useCallback((initialSteps: TourStep[]) => {
    setSteps(initialSteps);
    setStepIndex(0);
    setActive(true);
  }, []);

  const stop = useCallback(() => setActive(false), []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= steps.length) {
        setActive(false);
        return i;
      }
      return i + 1;
    });
  }, [steps.length]);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      active,
      step: active ? (steps[stepIndex] ?? null) : null,
      stepIndex,
      totalSteps: steps.length,
      start,
      next,
      back,
      stop,
    }),
    [active, steps, stepIndex, start, next, back, stop],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}
