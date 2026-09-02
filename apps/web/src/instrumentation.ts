/**
 * Server + Edge runtime instrumentation — see instrumentation-client.ts for
 * the browser side. Both are inert (Sentry.init never called) unless
 * NEXT_PUBLIC_SENTRY_DSN is set: this app shipped with zero error-tracking
 * of any kind until this file existed, found in a production-readiness
 * audit. `NEXT_PUBLIC_*` (not a server-only var) is deliberate — the DSN
 * identifies where events go, it isn't a secret, and the client build
 * needs the same value.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      // Off by default — error capture doesn't need trace sampling, and
      // turning this on has a real cost (Sentry bills per transaction).
      // A deployment that wants tracing sets it explicitly.
      tracesSampleRate: 0,
    });
  }
}

// Captures errors thrown during server rendering that error.tsx/
// global-error.tsx can't see themselves (they only catch client-side
// render errors) — the officially documented hook for this, see
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror
export const onRequestError = Sentry.captureRequestError;
