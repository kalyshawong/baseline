/**
 * Calories burned by a planned session (2026-10-19).
 *
 * Her own watch history comes first: the median active kcal per minute of
 * her logged workouts of that type (≥3 sessions). Otherwise the 2024 Adult
 * Compendium of Physical Activities (Herrmann 2024), as NET kcal —
 * (MET − 1) × kg × hours — so it matches the watch's "active" calories and
 * isn't double-counting the resting burn already inside TDEE.
 *
 * MET values checked against pacompendium.com on 2026-10-19.
 */

export type SessionType =
  | "running" | "strength" | "stairs" | "walking" | "cycling"
  | "rowing" | "elliptical" | "hiit";

export const SESSION_TYPES: SessionType[] = [
  "running", "strength", "stairs", "walking", "cycling", "rowing", "elliptical", "hiit",
];

/** 2024 Compendium: code, MET, description. */
export const COMPENDIUM_2024: Record<SessionType, { code: string; met: number; label: string }> = {
  running: { code: "12150", met: 8.0, label: "Running, general" },
  strength: { code: "02054", met: 3.5, label: "Resistance training, multiple exercises, 8–15 reps" },
  stairs: { code: "02065", met: 9.3, label: "Stair-treadmill ergometer, general" },
  walking: { code: "17190", met: 3.8, label: "Walking, 2.8–3.4 mph, moderate pace" },
  cycling: { code: "01200", met: 6.8, label: "Stationary bicycling, general" },
  rowing: { code: "02071", met: 5.0, label: "Stationary rowing, moderate (<100 W)" },
  elliptical: { code: "02048", met: 5.0, label: "Elliptical trainer, moderate" },
  hiit: { code: "02210", met: 7.0, label: "High-intensity interval exercise, moderate" },
};

/** Maps a HealthKit / Oura workout name to a session type. */
export function sessionTypeOf(name: string | null | undefined): SessionType | null {
  const n = (name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!n) return null;
  if (n.includes("stair")) return "stairs";
  if (n.includes("run")) return "running";
  if (n.includes("strength") || n.includes("weight") || n.includes("lift") || n.includes("functional")) return "strength";
  if (n.includes("walk") || n.includes("hik")) return "walking";
  if (n.includes("cycl") || n.includes("bik") || n.includes("spin")) return "cycling";
  if (n.includes("row")) return "rowing";
  if (n.includes("elliptic")) return "elliptical";
  if (n.includes("hiit") || n.includes("interval")) return "hiit";
  return null;
}

/** Her watch's median kcal/min by type, from ≥3 sessions. */
export type PersonalBurn = Partial<Record<SessionType, { kcalPerMin: number; n: number }>>;

export function personalBurnFrom(workouts: { name: string | null; durationSeconds: number | null; activeCalories: number | null }[]): PersonalBurn {
  const by = new Map<SessionType, number[]>();
  for (const w of workouts) {
    const t = sessionTypeOf(w.name);
    if (!t || !w.durationSeconds || !w.activeCalories || w.durationSeconds < 300) continue;
    const arr = by.get(t) ?? [];
    arr.push(w.activeCalories / (w.durationSeconds / 60));
    by.set(t, arr);
  }
  const out: PersonalBurn = {};
  for (const [t, v] of by) {
    if (v.length < 3) continue;
    v.sort((a, b) => a - b);
    const mid = Math.floor(v.length / 2);
    const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
    out[t] = { kcalPerMin: median, n: v.length };
  }
  return out;
}

export interface SessionBurn {
  type: SessionType;
  minutes: number;
  kcal: number;
  source: string; // "your watch, median of 15 runs" | "Compendium 2024, code 02065, 9.3 MET"
  fromWatch: boolean;
}

export function sessionBurn(type: SessionType, minutes: number, weightKg: number, personal: PersonalBurn): SessionBurn {
  const p = personal[type];
  if (p) {
    return {
      type, minutes,
      kcal: Math.round(p.kcalPerMin * minutes),
      source: `your watch, median ${p.kcalPerMin.toFixed(1)} kcal/min over ${p.n} sessions`,
      fromWatch: true,
    };
  }
  const c = COMPENDIUM_2024[type];
  return {
    type, minutes,
    kcal: Math.round((c.met - 1) * weightKg * (minutes / 60)),
    source: `Compendium 2024, code ${c.code} (${c.label}), ${c.met} MET`,
    fromWatch: false,
  };
}
