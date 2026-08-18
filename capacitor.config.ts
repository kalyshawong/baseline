import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Baseline iOS shell.
 *
 * Server-rendered Next.js app → the native shell loads the DEPLOYED app rather
 * than bundling static assets (App Router + API routes can't static-export).
 * The native layer's job is HealthKit: request permissions, register background
 * delivery, and POST new samples to /api/healthkit-sync on the same origin.
 *
 * webDir is a stub (Capacitor requires one); it isn't used when server.url is set.
 */
const config: CapacitorConfig = {
  appId: "com.kalysha.baseline",
  appName: "Baseline",
  webDir: "public",
  server: {
    url: "https://baseline-eta-rose.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#181613",
  },
};

export default config;
