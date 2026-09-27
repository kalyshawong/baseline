import { prisma } from "@/lib/db";
import { e1rm } from "@/lib/strength/session-plan";
import { fatigueSignal, lifterSoreness, bandsWithToday } from "@/lib/strength/body";

/**
 * Block view — design_handoff_baseline_ios_strength, screen 5.
 *
 * Baseline has no programme editor, so the block is DERIVED from his logs:
 * a block starts on the Monday of the first completed session after a gap of
 * 7+ days without training (or the very first session), runs 5 weeks, and
 * week 6 is the deload. Planned sets for a week = last week's sets (Hold =
 * repeat); week 1 has no plan. Nothing here is invented — every bar is sets
 * he actually did, and the only "plan" is a repeat of the previous week.
 */

export interface BlockWeek {
  index: number; // 1..6
  label: string;
  start: string;
  done: number | null; // sets completed (null = future)
  today: number; // today's open-session sets (current week only)
  plan: number | null; // last week's sets
  state: "done" | "cur" | "future" | "dl";
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
  currentWeek: number; // 1..6
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

  // Block boundaries: break on 7+ day gaps; every block is 6 weeks max.
  let blockStart = mondayOf(sessions[0].date);
  let blockNumber = 1;
  for (let i = 1; i < sessions.length; i++) {
    const gap = (sessions[i].date.getTime() - sessions[i - 1].date.getTime()) / DAY;
    if (gap >= 7 || (sessions[i].date.getTime() - blockStart.getTime()) / DAY >= 42) {
      blockStart = mondayOf(sessions[i].date);
      blockNumber++;
    }
  }
  const now = new Date();
  while ((now.getTime() - blockStart.getTime()) / DAY >= 42) {
    blockStart = new Date(blockStart.getTime() + 42 * DAY);
    blockNumber++;
  }
  const currentWeek = Math.min(6, Math.floor((now.getTime() - blockStart.getTime()) / (7 * DAY)) + 1);
  const end = new Date(blockStart.getTime() + 42 * DAY - 1);

  const { rows: bands } = await bandsWithToday();
  const todaySets = bands.reduce((n, b) => n + b.today, 0);
  const weeks: BlockWeek[] = [];
  let prev: number | null = null;
  for (let w = 1; w <= 6; w++) {
    const ws = new Date(blockStart.getTime() + (w - 1) * 7 * DAY);
    const we = new Date(ws.getTime() + 7 * DAY);
    const done = w <= currentWeek ? sessions.filter((s) => s.date >= ws && s.date < we).reduce((n, s) => n + s._count.sets, 0) : null;
    weeks.push({
      index: w,
      label: w === 6 ? "Deload" : `W${w}`,
      start: iso(ws),
      done,
      today: w === currentWeek ? todaySets : 0,
      plan: w === 6 ? (prev != null ? Math.round(prev / 2) : null) : prev,
      state: w === 6 ? (w === currentWeek ? "cur" : "dl") : w < currentWeek ? "done" : w === currentWeek ? "cur" : "future",
    });
    if (done != null) prev = done;
  }

  // Deload signals
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
