import type { NextConfig } from "next";

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

export default nextConfig;
