/**
 * Public demo tenant (2026-09-21).
 *
 * `usr_demo` is an ordinary tenant whose rows are a de-identified, date-shifted
 * copy of the solo tenant (see seed.ts). Anyone can enter it via /demo with no
 * password. Three independent layers keep it read-only:
 *
 *   1. middleware — any non-GET request from a demo session → 403
 *   2. db.ts      — every Prisma write is refused while the current user is demo
 *   3. routes     — the coach answers with a canned reply (no Anthropic spend)
 *
 * This file is pure constants: safe to import from the edge middleware.
 */
export const DEMO_USER_ID = "usr_demo";
export const DEMO_EMAIL = "demo@baseline.invalid";

export function isDemoUserId(id: string | null | undefined): boolean {
  return id === DEMO_USER_ID;
}

export class DemoReadOnlyError extends Error {
  constructor() {
    super("The demo is read-only");
    this.name = "DemoReadOnlyError";
  }
}
