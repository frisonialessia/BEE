"use client";

import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useEffect, useRef, type ReactNode } from "react";

import { getPublicEnv } from "@/lib/env";
import { useAuth } from "@/providers/auth-provider";

/** Product analytics — opt-in via NEXT_PUBLIC_POSTHOG_KEY (unset by
 * default: posthog-js is never initialized, zero behavior change, no
 * PostHog account needed to run this app, same contract every backend
 * opt-in in this codebase already uses).
 *
 * Why this exists: BEE has ~20 dashboard modules (dark funnel,
 * psychographic, resilience, priority feed, scenarios, ...) and until now
 * zero usage telemetry — no way to know which of them anyone actually
 * uses. This is the foundation every other product decision about that
 * backlog should be built on, not another feature to bet on blind.
 *
 * capture_pageview: false at init — Next.js App Router client-side
 * navigations don't fire a full page load, so PostHog's own automatic
 * pageview capture misses every route change after the first; PostHogPageview
 * below tracks them manually off usePathname()/useSearchParams() instead.
 *
 * Identifies the logged-in user once auth resolves (id + organization_id
 * + role only — never email/name, keeping this to the minimum PostHog
 * needs to let a query group events by tenant) and calls reset() on
 * logout so the next session in the same browser doesn't inherit the
 * previous user's identity.
 */

let initialized = false;

function initPostHog(): void {
  if (initialized || typeof window === "undefined") return;
  const env = getPublicEnv();
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) return;

  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
    capture_pageview: false,
    // Respect an opted-out browser (Do Not Track) rather than tracking
    // anyway — PostHog doesn't enable this by default.
    respect_dnt: true,
  });
  initialized = true;
}

function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!initialized) return;
    const query = searchParams.toString();
    posthog.capture("$pageview", { $current_url: query ? `${pathname}?${query}` : pathname });
  }, [pathname, searchParams]);

  return null;
}

function PostHogIdentify() {
  const { user } = useAuth();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!initialized) return;
    if (user) {
      if (identifiedUserId.current !== user.id) {
        posthog.identify(user.id, { organization_id: user.organization_id, role: user.role });
        identifiedUserId.current = user.id;
      }
    } else if (identifiedUserId.current !== null) {
      posthog.reset();
      identifiedUserId.current = null;
    }
  }, [user]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <>
      {/* useSearchParams() requires a Suspense boundary in the App Router
         — this tracker is the only thing inside it, so it never blocks
         rendering the rest of the tree. */}
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      <PostHogIdentify />
      {children}
    </>
  );
}
