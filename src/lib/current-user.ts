import { cache } from "react";
import { headers } from "next/headers";

// --- Session-backed tenant resolution (Phase 2 flip, 2026-08-25) ---
//
// Until now this returned a hardcoded id ("the app has exactly one tenant:
// you"). It now resolves the ACTUAL requester, in order:
//
//   1. Auth.js session   → that user's id (the real mechanism)
//   2. Native-shell UA token → Kalysha (transition: the iOS webview hasn't
//      proven a persistent login session yet; its token maps to her)
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

export const getCurrentUserId = cache(async (): Promise<string> => {
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

  // 2) Native shell (no session cookie, but carries the UA token).
  try {
    const ua = (await headers()).get("user-agent") ?? "";
    if (ua.includes("BaselineNative")) return SOLO_USER_ID;
  } catch {
    /* headers() outside request scope — fall through */
  }

  // 3) Transition default. TODO(invites): throw here instead, once every
  // channel (HAE, cron, native) carries an explicit user identity.
  return SOLO_USER_ID;
});
