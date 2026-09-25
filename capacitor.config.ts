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
  // UA marker only — used to label native requests and skip the PWA service
  // worker. It grants NO access and maps to NO account (2026-09-25): the app
  // signs in with a session like a browser.
  appendUserAgent: "BaselineNative/tk_9f4Qx2Lm8vRw",
  server: {
    url: "https://baseline-eta-rose.vercel.app",
    cleartext: false,
    // Shown (bundled from webDir) when the deployed app can't load: no
    // signal, Vercel down, Supabase paused. Instead of a blank white screen.
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#181613",
  },
  // NOTE: plugin registration happens natively in BaselineViewController
  // (registerPluginInstance) — Capacitor 8 has no config-level class list.
};

export default config;
