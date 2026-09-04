"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Tabs of the right pane — other pages deep-link into one of them
 *  (e.g. Estrategias' "Contactar" lands on `strategy`). */
export type DrawerTabKey = "activity" | "meetings" | "strategy" | "tasks" | "notes";

/** Pre-fill for create mode: a company page pins its account, a lead row
 *  pins the contact (and its company), a signal card pins signal type,
 *  headline, context and whatever company/lead the signal already names. */
export interface DrawerCreatePreset {
  companyId?: string;
  leadId?: string;
  signalId?: string;
}

type DrawerState =
  | { mode: "view"; opportunityId: string; tab?: DrawerTabKey }
  | { mode: "create"; preset?: DrawerCreatePreset }
  | null;

interface OpportunityDrawerContextValue {
  /** Which panel is open — `null` when closed. */
  mode: "view" | "create" | null;
  /** The opportunity shown in view mode; `null` otherwise. */
  opportunityId: string | null;
  /** Tab requested by the caller of `openOpportunity` (view mode). */
  initialTab: DrawerTabKey | undefined;
  /** Pre-fill handed to create mode. */
  createPreset: DrawerCreatePreset | undefined;
  openOpportunity: (id: string, options?: { tab?: DrawerTabKey }) => void;
  /** Opens the SAME side panel empty, in create mode — the one place in
   *  BEE where a lead, a company or an opportunity gets created by hand. */
  openNew: (preset?: DrawerCreatePreset) => void;
  closeOpportunity: () => void;
}

const OpportunityDrawerContext = createContext<OpportunityDrawerContextValue | null>(
  null,
);

export function OpportunityDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DrawerState>(null);

  const openOpportunity = useCallback((id: string, options?: { tab?: DrawerTabKey }) => {
    setState({ mode: "view", opportunityId: id, tab: options?.tab });
  }, []);

  const openNew = useCallback((preset?: DrawerCreatePreset) => {
    setState({ mode: "create", preset });
  }, []);

  const closeOpportunity = useCallback(() => {
    setState(null);
  }, []);

  const value = useMemo<OpportunityDrawerContextValue>(
    () => ({
      mode: state?.mode ?? null,
      opportunityId: state?.mode === "view" ? state.opportunityId : null,
      initialTab: state?.mode === "view" ? state.tab : undefined,
      createPreset: state?.mode === "create" ? state.preset : undefined,
      openOpportunity,
      openNew,
      closeOpportunity,
    }),
    [state, openOpportunity, openNew, closeOpportunity],
  );

  return (
    <OpportunityDrawerContext.Provider value={value}>
      {children}
    </OpportunityDrawerContext.Provider>
  );
}

export function useOpportunityDrawer() {
  const ctx = useContext(OpportunityDrawerContext);
  if (!ctx) {
    throw new Error("useOpportunityDrawer must be used within OpportunityDrawerProvider");
  }
  return ctx;
}
