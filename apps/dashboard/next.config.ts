import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dashboard independent from the posts API package.
  poweredByHeader: false,
  // Production Docker image uses Next.js standalone output (see apps/dashboard/Dockerfile).
  output: "standalone",
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
