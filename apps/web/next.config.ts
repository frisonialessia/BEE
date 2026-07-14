import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
