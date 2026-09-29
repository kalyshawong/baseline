/**
 * Intake — the questionnaire a new person answers on first sign-in, and the
 * pure function from those answers to "which cards exist for this person".
 *
 * Ported from the Expo pilot (baseline-app/src/core/generateConfig.ts) on
 * 2026-09-27 after Nahuel (Garmin, lifts, never runs) opened the app to a
 * wall of Oura and running dashes. Same rules: a device only earns the
 * cards it can fill; a goal only earns the sections it needs.
 *
 * Med NAMES are never stored — only whether something affects heart or sleep.
 */

import { normalizeSplit, type TrainingSplit } from "@/lib/strength/split";
export type { TrainingSplit } from "@/lib/strength/split";

export type GoalId = "heart_steady" | "sleep" | "running" | "strength" | "food_gi" | "general";
export type DeviceId = "apple" | "suunto" | "oura" | "garmin" | "none";
export type WearHistory = "new" | "weeks" | "months";
export type CycleStatus = "regular" | "irregular" | "none" | "skip";
export type RecordsHabit = "most" | "some" | "rarely";
export type ScheduleKind = "steady" | "drift" | "shift";
export type ContextFlag = "travel" | "altitude";
export type RitualSlot = "evening" | "morning" | "none";
export type Sex = "male" | "female" | "other";
export type MedEffect = "heart" | "sleep" | "unsure";
export type Phase = "gain" | "maintain" | "lose";
export type Unit = "lb" | "kg";
export type QuestionTemplateId = "baseline_first" | "sleep_change" | "recovery_change" | "performance_change" | "food_watch";

export interface IntakeState {
  goals: GoalId[];
  /** Asked before the cycle question; men skip it. Stored on UserProfile.sex too. */
  sex: Sex | null;
  devices: DeviceId[];
  history: WearHistory | null;
  cycle: CycleStatus | null;
  /** Category flags only. Empty = no regular medication that matters. */
  meds: MedEffect[];
  records: RecordsHabit | null; // asked only when running/strength picked
  schedule: ScheduleKind | null;
  context: ContextFlag[];
  question: QuestionTemplateId | null;
  ritual: RitualSlot | null;
  /** Body basics — asked of everyone; mirrored to UserProfile. Stored metric. */
  unit: Unit | null;
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  /** Measured BMR if they know it (InBody/DEXA); null = Mifflin-St Jeor estimate. */
  bmrKcal: number | null;
  /** Bulk / cut / maintain — asked when strength is a goal; sets the protein target. */
  phase: Phase | null;
  /** Their own training split — asked when strength is a goal. Never a plan from us. */
  split: TrainingSplit | null;
}

/** Height, weight and age answered — BMR and protein can be computed. */
export function bodyComplete(s: IntakeState | null): boolean {
  return !!s && s.heightCm != null && s.weightKg != null && s.age != null;
}

export const EMPTY_INTAKE: IntakeState = {
  goals: [],
  sex: null,
  devices: [],
  history: null,
  cycle: null,
  meds: [],
  records: null,
  schedule: null,
  context: [],
  question: null,
  ritual: null,
  unit: null,
  heightCm: null,
  weightKg: null,
  age: null,
  bmrKcal: null,
  phase: null,
  split: null,
};

const GOALS = new Set<GoalId>(["heart_steady", "sleep", "running", "strength", "food_gi", "general"]);
const DEVICES = new Set<DeviceId>(["apple", "suunto", "oura", "garmin", "none"]);
const numIn = (v: unknown, min: number, max: number, integer = false): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return integer ? Math.round(n) : Math.round(n * 10) / 10;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;

/** Accepts the pilot's on-device shape too (meds as objects with effect). */
export function normalizeIntake(raw: unknown): IntakeState {
  if (!raw || typeof raw !== "object") return EMPTY_INTAKE;
  const o = raw as Record<string, unknown>;
  const goals = Array.isArray(o.goals) ? (o.goals.filter((g) => GOALS.has(g as GoalId)) as GoalId[]) : [];
  let devices = Array.isArray(o.devices) ? (o.devices.filter((d) => DEVICES.has(d as DeviceId)) as DeviceId[]) : [];
  if (!devices.length && DEVICES.has(o.device as DeviceId)) devices = [o.device as DeviceId];
  const medsRaw = Array.isArray(o.meds) ? o.meds : [];
  const meds = [...new Set(
    medsRaw
      .map((m) => (typeof m === "string" ? m : m && typeof m === "object" ? (m as { effect?: unknown }).effect : null))
      .filter((e): e is MedEffect => e === "heart" || e === "sleep" || e === "unsure"),
  )];
  return {
    goals,
    sex: oneOf(o.sex, ["male", "female", "other"] as const),
    devices,
    history: oneOf(o.history, ["new", "weeks", "months"] as const),
    cycle: oneOf(o.cycle, ["regular", "irregular", "none", "skip"] as const),
    meds,
    records: oneOf(o.records, ["most", "some", "rarely"] as const),
    schedule: oneOf(o.schedule, ["steady", "drift", "shift"] as const),
    context: Array.isArray(o.context) ? (o.context.filter((c) => c === "travel" || c === "altitude") as ContextFlag[]) : [],
    question: oneOf(o.question, ["baseline_first", "sleep_change", "recovery_change", "performance_change", "food_watch"] as const),
    ritual: oneOf(o.ritual, ["evening", "morning", "none"] as const),
    unit: oneOf(o.unit, ["lb", "kg"] as const),
    heightCm: numIn(o.heightCm, 100, 250),
    weightKg: numIn(o.weightKg, 20, 400),
    age: numIn(o.age, 13, 120, true),
    bmrKcal: numIn(o.bmrKcal, 700, 4500, true),
    phase: oneOf(o.phase, ["gain", "maintain", "lose"] as const),
    split: normalizeSplit(o.split),
  };
}

/* ---------------- gates: answers → which cards exist ---------------- */

export interface DashboardGates {
  /** The intake this was derived from (null = legacy everything-on). */
  intake: IntakeState | null;
  goals: GoalId[];
  devices: DeviceId[];
  hasOura: boolean;
  hasWatch: boolean;
  /** Any wearable that writes nights + heart rate to Apple Health (Watch/Suunto/Garmin). */
  hasHealthKitWearable: boolean;
  runs: boolean;
  lifts: boolean;
  trains: boolean;
  /** Running & Cardio section, Hyrox strip, run landmarks. */
  cardio: boolean;
  /** Overnight HRV / Stress / SpO₂ / Resilience — Oura-only signals. */
  ouraRecovery: boolean;
  /** Run dynamics (ground contact, vertical oscillation, stride, run power) — Watch-only. */
  runDynamics: boolean;
  /** The "Connect Oura" button. */
  ouraConnect: boolean;
  /** Cycle card + phase adjustment. */
  cycle: boolean;
  /** Food & gut tagging emphasis. */
  foodGi: boolean;
  /** Strength log leads the Body page. */
  strengthFirst: boolean;
  /** Runs AND lifts — lifting call + run/legs conflict on Today (2026-09-28). */
  hybrid: boolean;
}

const EVERYTHING: DashboardGates = {
  intake: null,
  goals: ["heart_steady", "sleep", "running", "strength", "food_gi"],
  devices: ["apple", "oura"],
  hasOura: true,
  hasWatch: true,
  hasHealthKitWearable: true,
  runs: true,
  lifts: true,
  trains: true,
  cardio: true,
  ouraRecovery: true,
  runDynamics: true,
  ouraConnect: true,
  cycle: true,
  foodGi: true,
  strengthFirst: false,
  hybrid: true,
};

export function gatesFor(intake: IntakeState | null): DashboardGates {
  if (!intake) return EVERYTHING;
  const g = new Set(intake.goals);
  const d = new Set(intake.devices);
  const hasOura = d.has("oura");
  const hasWatch = d.has("apple");
  const hasHealthKitWearable = hasWatch || d.has("suunto") || d.has("garmin");
  const runs = g.has("running");
  const lifts = g.has("strength");
  const trains = runs || lifts;
  const cycleTracked = intake.cycle === "regular" || intake.cycle === "irregular";
  return {
    intake,
    goals: intake.goals,
    devices: intake.devices,
    hasOura,
    hasWatch,
    hasHealthKitWearable,
    runs,
    lifts,
    trains,
    cardio: runs,
    ouraRecovery: hasOura,
    runDynamics: runs && hasWatch,
    ouraConnect: hasOura,
    cycle: cycleTracked,
    foodGi: g.has("food_gi"),
    strengthFirst: lifts && !runs,
    hybrid: lifts && runs,
  };
}

