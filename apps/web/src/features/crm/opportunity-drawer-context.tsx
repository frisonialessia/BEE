"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface OpportunityDrawerContextValue {
  opportunityId: string | null;
  openOpportunity: (id: string) => void;
  closeOpportunity: () => void;
}

const OpportunityDrawerContext = createContext<OpportunityDrawerContextValue | null>(
  null,
);

export function OpportunityDrawerProvider({ children }: { children: ReactNode }) {
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  const openOpportunity = useCallback((id: string) => {
    setOpportunityId(id);
  }, []);

  const closeOpportunity = useCallback(() => {
    setOpportunityId(null);
  }, []);

  const value = useMemo(
    () => ({ opportunityId, openOpportunity, closeOpportunity }),
    [opportunityId, openOpportunity, closeOpportunity],
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
