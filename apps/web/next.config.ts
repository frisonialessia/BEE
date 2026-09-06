import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

/**
 * Security headers for the frontend. The API has published its own since
 * day one (SecurityHeadersMiddleware); this app published none at all, so
 * the session token in localStorage sat behind nothing but the absence of
 * an XSS.
 *
 * `script-src` keeps 'unsafe-inline' on purpose: the App Router streams
 * inline bootstrap scripts on every page, and the nonce that would replace
 * this needs a middleware that rewrites every response. That is a real
 * change to make, not one to make the morning of a launch. Even with it,
 * the rest of this policy is worth having today — `frame-ancestors`,
 * `base-uri`, `object-src` and above all `connect-src` mean injected code
 * cannot reframe the app, rewrite relative URLs, or exfiltrate anything to
 * a host that is not the API.
 *
 * `connect-src` has to name the API explicitly: it lives on its own origin
 * (two separate Vercel projects, see CLAUDE.md), so 'self' does not cover
 * it and every fetch would be blocked. 'unsafe-eval' is dev-only — React
 * Refresh needs it, production does not.
 */
function securityHeaders() {
  const api = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${api ? ` ${api}` : ""} https://*.sentry.io${dev ? " ws: http://localhost:*" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ];
}

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  // The dev-mode route indicator badge renders bottom-left, exactly where
  // the dashboard rail's own icons (Equipo, Cerrar sesión) live — it visually
  // and functionally intercepts clicks on them during local development.
  devIndicators: false,
  async redirects() {
    return [
      {
        source: "/control",
        destination: "/dashboard/control",
        permanent: true,
      },
    ];
  },
};

// Points at src/i18n/request.ts — no [locale] segment, no routing/middleware
// (see that file's docstring for why). This plugin only wires the request
// config into the RSC render pipeline so `getTranslations`/`getFormatter`
// work in server components; it doesn't change routing at all.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// withSentryConfig only wires the build-time plugin (source-map upload,
// tunnel route) — it does NOT turn error capture on by itself; that's
// instrumentation.ts / instrumentation-client.ts, both gated on
// NEXT_PUBLIC_SENTRY_DSN being set. Wrapping unconditionally is safe with
// no Sentry project configured at all: without SENTRY_AUTH_TOKEN (or
// org/project) the plugin skips source-map upload rather than failing the
// build — verified with a real `pnpm build` run with none of these set.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // No org/project/DSN configured yet — this whole call is inert until a
  // deployment sets NEXT_PUBLIC_SENTRY_DSN (see instrumentation.ts) and,
  // optionally, the three build-time vars above for readable stack traces.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
