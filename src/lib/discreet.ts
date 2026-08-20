import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Discreet mode — "showing the app to friends and family" (her ask,
 * 2026-08-20). While on, intimate surfaces are excluded SERVER-SIDE: they
 * never render and never reach the DOM, so nothing sensitive is one
 * inspect-element away.
 *
 * Hidden while on:
 *   - all cycle/menstrual cards (dashboard, Body, Mind)
 *   - life-context defs in SENSITIVE_CONTEXT_GROUPS (e.g. the shared-bed
 *     sleep-context group)
 *
 * Toggled by the eye button (DiscreetToggle) via the bl_discreet cookie.
 * Cookie has a 12h max-age so a discreet session can't silently become the
 * permanent state if she forgets to toggle back.
 */

export const DISCREET_COOKIE = "bl_discreet";

/** LifeContextDef.groupKey values to hide while discreet. */
export const SENSITIVE_CONTEXT_GROUPS = new Set(["sleep-context"]);

export const getDiscreetMode = cache(async (): Promise<boolean> => {
  try {
    return (await cookies()).get(DISCREET_COOKIE)?.value === "1";
  } catch {
    return false; // outside request scope
  }
});
