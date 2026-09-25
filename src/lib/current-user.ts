import { cache } from "react";
import { AsyncLocalStorage } from "node:async_hooks";

// --- Session-backed tenant resolution (Phase 2 flip, 2026-08-25) ---
//
// Until now this returned a hardcoded id ("the app has exactly one tenant:
// you"). It now resolves the ACTUAL requester, in order:
//
//   1. Auth.js session   → that user's id (the real mechanism)
//   2. (removed 2026-09-25 — native shell now signs in; see below)
//   3. Anything else (HAE key-authed posts, cron, legacy Basic-auth,
//      scripts) → Kalysha (transition: those channels are hers by
//      construction today; per-user sync keys arrive with invites)
//
// Fallbacks 2–3 mean HER experience is byte-identical to before the flip,
// while a session-holding second user is scoped to their own data
// everywhere, because every query in the codebase goes through here.
//
// React cache(): one resolution per request no matter how many of the
// ~143 callsites fire.

export const SOLO_USER_ID = "usr_kalysha";

// --- Explicit tenant override (2026-09-21) ---
//
// Some code runs where the request can't be read: inside `unstable_cache`
// (auth()/headers() throw there) and in background jobs. Before this existed
// those paths fell through to fallback 3 and silently resolved to Kalysha —
// which handed HER cached dashboard scores to any other signed-in user.
// `runAsUser` pins the tenant for everything awaited inside `fn`, and is
// checked BEFORE the per-request memo so it can never be shadowed by it.
const tenantOverride = new AsyncLocalStorage<{ userId: string }>();

export function runAsUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return tenantOverride.run({ userId }, fn);
}

export async function getCurrentUserId(): Promise<string> {
  const pinned = tenantOverride.getStore();
  if (pinned) return pinned.userId;
  return resolveRequestUserId();
}

const resolveRequestUserId = cache(async (): Promise<string> => {
  // 1) Session. Dynamic import keeps auth's Node-only deps (bcrypt, prisma)
  // out of any module graph that must stay edge/script-safe.
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    const uid = (session as { userId?: string } | null)?.userId;
    if (uid) return uid;
  } catch {
    /* outside a request scope (scripts) or auth unavailable — fall through */
  }

  // 2) Native shell: REMOVED 2026-09-25. The UA token mapped every copy of
  // the iOS app to Kalysha, so any TestFlight tester would have opened her
  // account and synced their Health data into it. The app now signs in with
  // a session like any browser, and HealthKit posts carry a per-user token
  // (src/lib/sync-token.ts) resolved with runAsUser.

  // 3) Transition default (legacy Basic-auth passcode, scripts). TODO(invites): throw here instead, once every
  // channel (HAE, cron, native) carries an explicit user identity.
  return SOLO_USER_ID;
});
