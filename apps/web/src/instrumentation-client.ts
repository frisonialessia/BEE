/**
 * Browser-side instrumentation — runs after the HTML loads, before React
 * hydrates (see instrumentation.ts for the server/edge side). Inert unless
 * NEXT_PUBLIC_SENTRY_DSN is set.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}

// Required export point for Next.js's router-transition instrumentation —
// see the instrumentation-client.js file-convention docs. Sentry.captureRouterTransitionStart
// is the SDK's own no-op-safe implementation (does nothing when Sentry.init was never called above).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
