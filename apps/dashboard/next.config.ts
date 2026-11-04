import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dashboard independent from the posts API package.
  poweredByHeader: false,
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
