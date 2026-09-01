import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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

export default withNextIntl(nextConfig);
