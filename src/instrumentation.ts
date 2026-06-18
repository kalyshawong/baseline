// Runs once at server startup (Next.js instrumentation hook).
//
// Vercel's servers run in UTC, so server-rendered times ("Last sync 6:38 PM")
// were showing UTC instead of the user's local time. Vercel reserves the `TZ`
// env var, so we can't set it in the dashboard — instead we set it here at
// startup. Node re-evaluates the timezone when process.env.TZ changes, so all
// subsequent server-side Date formatting uses this zone.
//
// Override with the APP_TZ env var (not reserved) if needed; defaults to Eastern.
// NOTE: single-zone — when the app goes multi-user, render times client-side
// (browser timezone) or per-user instead.
export function register() {
  process.env.TZ = process.env.APP_TZ || "America/New_York";
}
