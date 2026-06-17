// --- Single-tenant shim (Phase 0 bridge) ---
// Until auth lands (roadmap Phase 2), the app has exactly one tenant: you.
// Every query/write should scope to getCurrentUserId() instead of assuming
// "the only data." When auth arrives, swap the body to read the session user
// and NOTHING else in the codebase has to change.
//
// The id matches the User row created by the migration (scripts/migration).

export const SOLO_USER_ID = "usr_kalysha";

export function getCurrentUserId(): string {
  return SOLO_USER_ID;
}
