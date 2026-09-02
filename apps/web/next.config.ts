import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
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
