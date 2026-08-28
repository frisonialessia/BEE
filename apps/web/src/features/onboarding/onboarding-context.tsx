"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "bee_onboarding_dismissed_v1";

interface OnboardingContextValue {
  isOpen: boolean;
  openIntro: () => void;
  closeIntro: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/** Guided intro for a first-time visit to the dashboard — see
 * `onboarding-intro.tsx` for the actual content. Opens itself once per
 * browser (tracked in localStorage, same pattern as the rest of this app's
 * client-only preferences) and can be reopened any time from the header. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  // Lazy initializer, not an effect: this component only ever mounts on the
  // client (DashboardLayout gates all children behind an auth check first),
  // so reading localStorage here — instead of setState-in-effect after an
  // initial closed render — avoids a pointless extra render with no
  // hydration-mismatch risk.
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return !window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (private browsing, disabled storage) —
      // just skip the auto-open rather than crash the dashboard over it.
      return false;
    }
  });

  const closeIntro = useCallback(() => {
    setIsOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Same as above — not persisting across reloads isn't worth an error.
    }
  }, []);

  const openIntro = useCallback(() => setIsOpen(true), []);

  const value = useMemo(() => ({ isOpen, openIntro, closeIntro }), [isOpen, openIntro, closeIntro]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
