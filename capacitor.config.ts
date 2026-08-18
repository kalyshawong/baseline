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
  // The native WebView can't answer HTTP Basic Auth dialogs, so the shell
  // identifies itself with this UA token and the middleware lets it through
  // (browsers still hit the passcode). Interim until real auth (roadmap §5.2);
  // must match NATIVE_APP_UA_TOKEN in the server env.
  appendUserAgent: "BaselineNative/tk_9f4Qx2Lm8vRw",
  server: {
    url: "https://baseline-eta-rose.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#181613",
  },
  // NOTE: plugin registration happens natively in BaselineViewController
  // (registerPluginInstance) — Capacitor 8 has no config-level class list.
};

export default config;
