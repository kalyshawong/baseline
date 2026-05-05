import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Exclude .playwright-mcp from the file watcher — Playwright writes
    // console/snapshot logs here continuously, which triggers an infinite
    // HMR rebuild loop that freezes client-side navigation.
    const existing = config.watchOptions?.ignored;
    const ignored = Array.isArray(existing)
      ? [...existing, '**/.playwright-mcp/**']
      : ['**/.playwright-mcp/**'];
    config.watchOptions = { ...config.watchOptions, ignored };
    return config;
  },
};

export default nextConfig;
