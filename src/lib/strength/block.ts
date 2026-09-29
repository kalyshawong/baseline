import { prisma } from "@/lib/db";
import { e1rm } from "@/lib/strength/session-plan";
import { fatigueSignal, lifterSoreness, bandsWithToday } from "@/lib/strength/body";

/**
 * Block view — design_handoff_baseline_ios_strength, screen 5.
 *
 * DATA ONLY (2026-09-28): Baseline never plans someone's training, so there
 * are no planned sets, no scheduled deload week and no deload suggestion.
 * A block is read from the log: it starts on the Monday of the first
 * completed session after 7+ days off (or the very first session) and runs
 * until the next 7+ day break. The view shows its last 6 weeks: sets done,
 * with the previous week's sets as the comparison. Fatigue signals are shown
 * as data.
 */

export interface BlockWeek {
  index: number; // week number within the block (1-based)
  label: string;
  start: string;
  done: number; // sets completed
  today: number; // today's open-session sets (current week only)
  prev: number | null; // previous week's sets — comparison, not a plan
  state: "done" | "cur";
}

export interface DeloadSignal {
  name: string;
  rule: string;
  value: string;
  met: boolean;
}

export interface BlockData {
  number: number;
  start: string;
  end: string;
  currentWeek: number; // weeks since the block started (1-based)
  weeks: BlockWeek[];
  signals: DeloadSignal[];
  metCount: number;
  lifts: { name: string; delta: number | null; now: number | null; note: string }[];
  daysLeftInWeek: number;
}

const DAY = 86400_000;
function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Mon = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const LIFTS: { name: string; re: RegExp }[] = [
  { name: "Bench", re: /bench press/i },
  { name: "Squat", re: /^(back |barbell )?squat$/i },
  { name: "OHP", re: /overhead press|^ohp$/i },
];

export async function blockData(): Promise<BlockData | null> {
  const sessions = await prisma.workoutSession.findMany({
    where: { completedAt: { not: null } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, _count: { select: { sets: { where: { isWarmup: false } } } } },
  });
  if (!sessions.length) return null;

  // Block boundaries: break on 7+ day gaps only — no fixed length.
  let blockStart = mondayOf(sessions[0].date);
  let blockNumber = 1;
  for (let i = 1; i < sessions.length; i++) {
    const gap = (sessions[i].date.getTime() - sessions[i - 1].date.getTime()) / DAY;
    if (gap >= 7) {
      blockStart = mondayOf(sessions[i].date);
      blockNumber++;
    }
  }
  const now = new Date();
  const currentWeek = Math.floor((now.getTime() - blockStart.getTime()) / (7 * DAY)) + 1;
  const end = now;

  const { rows: bands } = await bandsWithToday();
  const todaySets = bands.reduce((n, b) => n + b.today, 0);
  const weeks: BlockWeek[] = [];
  const firstShown = Math.max(1, currentWeek - 5);
  for (let w = firstShown; w <= currentWeek; w++) {
    const setsIn = (k: number) => {
      const ws = new Date(blockStart.getTime() + (k - 1) * 7 * DAY);
      const we = new Date(ws.getTime() + 7 * DAY);
      return sessions.filter((s) => s.date >= ws && s.date < we).reduce((n, s) => n + s._count.sets, 0);
    };
    weeks.push({
      index: w,
      label: `W${w}`,
      start: iso(new Date(blockStart.getTime() + (w - 1) * 7 * DAY)),
      done: setsIn(w),
      today: w === currentWeek ? todaySets : 0,
      prev: w > 1 ? setsIn(w - 1) : null,
      state: w === currentWeek ? "cur" : "done",
    });
  }

  // Fatigue signals — shown as data; Baseline doesn't schedule deloads.
  const sore = await lifterSoreness();
  const fatigue = await fatigueSignal(sore);
  const over = bands.filter((b) => b.band && b.sets > b.band[2]).length;
  const signals: DeloadSignal[] = [
    { name: "Fatigue signal", rule: "High for 3+ days", value: fatigue.state, met: fatigue.state === "High" },
    { name: "Soreness", rule: "3+ muscles at 2+ for 48 h", value: `${fatigue.sore48.length} muscle${fatigue.sore48.length === 1 ? "" : "s"}`, met: fatigue.sore48.length >= 3 },
    { name: "Volume", rule: "3+ muscles above your max", value: `${over} muscle${over === 1 ? "" : "s"}`, met: over >= 3 },
  ];
  const metCount = signals.filter((s) => s.met).length;

  // e1RM since block start: best in the block's first week vs best in the last 7 days.
  const sets = await prisma.workoutSet.findMany({
    where: { isWarmup: false, session: { completedAt: { not: null }, date: { gte: blockStart } } },
    select: { weight: true, reps: true, rir: true, rpe: true, session: { select: { date: true } }, exercise: { select: { name: true } } },
  });
  const w1end = new Date(blockStart.getTime() + 7 * DAY);
  const lifts = LIFTS.map((l) => {
    const mine = sets.filter((s) => l.re.test(s.exercise.name.trim()));
    const best = (arr: typeof mine) => arr.reduce((m, s) => Math.max(m, e1rm(s.weight, s.reps, s.rir ?? (s.rpe != null ? Math.max(0, 10 - s.rpe) : null))), 0);
    const first = best(mine.filter((s) => s.session.date < w1end));
    const latest = best(mine.filter((s) => s.session.date >= new Date(now.getTime() - 7 * DAY)));
    if (!mine.length) return { name: l.name, delta: null, now: null, note: "Not logged this block" };
    const nowV = latest || best(mine);
    if (!first || currentWeek === 1) return { name: l.name, delta: null, now: nowV, note: "Reference set in week 1" };
    return { name: l.name, delta: nowV - first, now: nowV, note: `${(Math.round(nowV * 10) / 10).toFixed(1).replace(/\.0$/, "")} now` };
  });

  const daysLeftInWeek = 7 - Math.floor(((now.getTime() - blockStart.getTime()) / DAY) % 7);
  return { number: blockNumber, start: `${fmt(blockStart)}`, end: fmt(end), currentWeek, weeks, signals, metCount, lifts, daysLeftInWeek };
}
