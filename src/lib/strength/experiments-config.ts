/**
 * Pure config for lifting experiments (no server imports) — shared by the
 * designer (client) and the engine (server). Copy is the design bundle's.
 */

export interface LiftVariable {
  id: string;
  n: string;
  A: string;
  B: string;
  len: number[]; // allowed block lengths in weeks
  note?: string;
  /** Rest-interval arms feed the session log's rest timer (seconds). */
  rest?: { A: number; B: number };
}

export const VARS: LiftVariable[] = [
  { id: "sleep", n: "Sleep extension", A: "Usual bedtime", B: "+60 min in bed", len: [1, 2] },
  { id: "carbs", n: "Pre-workout carbs", A: "No carbs 2 h before", B: "60 g carbs 60–90 min before", len: [1, 2] },
  { id: "caf", n: "Caffeine timing", A: "200 mg 30 min before", B: "200 mg on waking", len: [1, 2] },
  { id: "crea", n: "Creatine", A: "No creatine", B: "5 g every day", len: [4], note: "Creatine takes about 4 weeks to saturate muscle and as long to wash out, so blocks are fixed at 4 weeks." },
  { id: "freq", n: "Training frequency", A: "Each muscle 1× / week", B: "Each muscle 2× / week", len: [2], note: "Weekly sets stay the same in both arms; only how they are split changes." },
  { id: "rest", n: "Rest intervals", A: "90 s", B: "3 min", len: [1, 2], rest: { A: 90, B: 180 } },
];

export const LIFT_OPTIONS = ["Bench", "Squat", "OHP", "Deadlift"] as const;
export type LiftName = (typeof LIFT_OPTIONS)[number];

export const LIFT_RE: Record<LiftName, RegExp> = {
  Bench: /bench press/i,
  Squat: /^(back |barbell )?squat$/i,
  OHP: /overhead press|^ohp$/i,
  Deadlift: /deadlift/i,
};

export type Outcome = "vol" | "e1";

export interface LiftDesign {
  variable: string;
  outcome: Outcome;
  rpe: 7 | 8 | 9;
  lift: LiftName;
  blockWeeks: number;
  blocks: 4 | 6 | 8;
}

export interface LiftBlock {
  idx: number; // 0-based
  pairIdx: number;
  start: string; // YYYY-MM-DD (Monday)
  end: string; // YYYY-MM-DD (Sunday)
  arm: "A" | "B";
  value: number | null;
  sessions: number;
}

export interface LiftPreReg {
  kind: "lift";
  variable: string;
  arms: { A: string; B: string };
  outcome: Outcome;
  rpe: number;
  lift: LiftName;
  blockWeeks: number;
  blocks: number;
  analysis: string;
  exclusionRule: string;
  lockedAt: string;
}

export function outcomeLabel(d: { outcome: Outcome; rpe: number; lift: string }): string {
  return d.outcome === "vol" ? `${d.lift} volume at RPE ${d.rpe}` : `${d.lift} estimated 1RM`;
}

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dstr(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MON[m - 1]} ${d}`;
}

/** Next Monday strictly after `from` (UTC dates). */
export function nextMonday(from: Date): Date {
  const x = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const dow = x.getUTCDay(); // 0 Sun
  const add = dow === 1 ? 7 : ((8 - dow) % 7 || 7);
  x.setUTCDate(x.getUTCDate() + add);
  return x;
}
