import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import {
  CANDIDATE_LIBRARY,
  FEASIBILITY,
  type CandidateDef,
} from "./candidates";

/**
 * Diagnose engine — event-triggered cause isolation over degraded workout
 * streaks (DIAGNOSE-ENGINE-SPEC.md). Pure logic over prisma reads; state
 * persists in DiagnoseFlow / DiagnoseCandidateState / DiagnoseRun.
 *
 * DEVIATIONS from the spec, documented (data we don't collect yet):
 *  - prescribedRPE doesn't exist in the workout log. Effort guard adapts to:
 *    session mean reported RPE >= her trailing 8-week median RPE (i.e. she
 *    was trying at least as hard as usual while underperforming).
 *  - Category "run" flags on DailyRunningMetrics.runningSpeed z-scores
 *    (pace-at-fixed-HR needs paired HR streams; future upgrade).
 */

export interface SessionQuality {
  sessionId: string;
  date: string; // YYYY-MM-DD
  volumeLoad: number;
  reportedRpe: number | null;
  zScore: number;
  flagged: boolean;
}

export interface ContextCheck {
  check: string;
  explained: boolean;
  note: string;
}

export interface RankedCandidate {
  id: string;
  label: string;
  class: CandidateDef["class"];
  score: number;
  evidence: number;
  prior: number;
  status: string;
  testableNow: boolean;
  honestLabel: string; // how non-crossover classes are surfaced (§5.2)
}

const STREAK_MIN = 3;
const STREAK_WINDOW_DAYS = 10;
const DEBOUNCE_DAYS = 14;
const Z_FLAG = -1.0;
const SELF_RESOLVE_Z = -0.25;

function dstr(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ── Session quality (§3) ────────────────────────────────────────────────

/** Strength sessions: z of sessionVolume vs trailing 8-week baseline of
 *  completed sessions, EXCLUDING the last 10 days [GUARD: the streak must
 *  not contaminate its own baseline]. */
export async function strengthSessionQuality(): Promise<SessionQuality[]> {
  const sessions = await prisma.workoutSession.findMany({
    where: {
      completedAt: { not: null },
      sessionVolume: { not: null, gt: 0 },
      date: { gte: new Date(Date.now() - 70 * 86_400_000) },
    },
    orderBy: { date: "asc" },
    include: { sets: { where: { isWarmup: false, rpe: { not: null } }, select: { rpe: true } } },
  });
  if (sessions.length < 6) return [];

  const cutoff = Date.now() - STREAK_WINDOW_DAYS * 86_400_000;
  const baseline = sessions.filter((s) => s.date.getTime() < cutoff);
  if (baseline.length < 4) return [];

  const vols = baseline.map((s) => s.sessionVolume!);
  const mu = vols.reduce((a, b) => a + b, 0) / vols.length;
  const sd = Math.sqrt(vols.reduce((a, b) => a + (b - mu) ** 2, 0) / (vols.length - 1));
  if (sd === 0) return [];

  const rpes = baseline
    .map((s) => s.sets.map((x) => x.rpe!))
    .filter((a) => a.length > 0)
    .map((a) => a.reduce((x, y) => x + y, 0) / a.length)
    .sort((a, b) => a - b);
  const medianRpe = rpes.length ? rpes[Math.floor(rpes.length / 2)] : null;

  return sessions.map((s) => {
    const z = (s.sessionVolume! - mu) / sd;
    const sessRpes = s.sets.map((x) => x.rpe!);
    const avgRpe = sessRpes.length ? sessRpes.reduce((a, b) => a + b, 0) / sessRpes.length : null;
    // Effort guard: underperformed WHILE trying at least as hard as usual.
    // When RPE is unlogged we can't verify effort → don't flag on volume alone.
    const effortOk = avgRpe != null && medianRpe != null ? avgRpe >= medianRpe - 0.5 : false;
    return {
      sessionId: s.id,
      date: dstr(s.date),
      volumeLoad: s.sessionVolume!,
      reportedRpe: avgRpe,
      zScore: Math.round(z * 100) / 100,
      flagged: z <= Z_FLAG && effortOk,
    };
  });
}

/** Run sessions: z of runningSpeed vs trailing baseline (same exclusions). */
export async function runSessionQuality(): Promise<SessionQuality[]> {
  const rows = await prisma.dailyRunningMetrics.findMany({
    where: { runningSpeed: { not: null, gt: 0 }, day: { gte: new Date(Date.now() - 70 * 86_400_000) } },
    orderBy: { day: "asc" },
    select: { id: true, day: true, runningSpeed: true, physicalEffort: true },
  });
  if (rows.length < 6) return [];
  const cutoff = Date.now() - STREAK_WINDOW_DAYS * 86_400_000;
  const baseline = rows.filter((r) => r.day.getTime() < cutoff);
  if (baseline.length < 4) return [];
  const vals = baseline.map((r) => r.runningSpeed!);
  const mu = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / (vals.length - 1));
  if (sd === 0) return [];
  const efforts = baseline.map((r) => r.physicalEffort).filter((x): x is number => x != null).sort((a, b) => a - b);
  const medEffort = efforts.length ? efforts[Math.floor(efforts.length / 2)] : null;
  return rows.map((r) => {
    const z = (r.runningSpeed! - mu) / sd;
    const effortOk = r.physicalEffort != null && medEffort != null ? r.physicalEffort >= medEffort - 0.5 : true;
    return {
      sessionId: r.id,
      date: dstr(r.day),
      volumeLoad: r.runningSpeed!,
      reportedRpe: r.physicalEffort ?? null,
      zScore: Math.round(z * 100) / 100,
      flagged: z <= Z_FLAG && effortOk,
    };
  });
}

/** Streak rule: >= 3 flagged in a rolling 10-day window (§3). */
export function streakFired(sessions: SessionQuality[]): SessionQuality[] | null {
  const flagged = sessions.filter((s) => s.flagged);
  for (let i = 0; i + STREAK_MIN - 1 < flagged.length; i++) {
    const a = new Date(flagged[i].date + "T00:00:00Z").getTime();
    const b = new Date(flagged[i + STREAK_MIN - 1].date + "T00:00:00Z").getTime();
    if ((b - a) / 86_400_000 <= STREAK_WINDOW_DAYS) {
      return flagged.slice(i, i + STREAK_MIN);
    }
  }
  return null;
}

// ── Stage 0 context checks (§4) — first explanation wins ────────────────

export async function runContextChecks(flagged: SessionQuality[]): Promise<{
  checks: ContextCheck[];
  explanation: ContextCheck | null;
}> {
  const checks: ContextCheck[] = [];
  const days = flagged.map((f) => f.date);
  const dayDates = days.map((d) => new Date(d + "T00:00:00.000Z"));

  // 4.1 cycle phase — >= 2 flagged sessions in menstrual / late-luteal
  const { resolveCyclePhase } = await import("@/lib/cycle-phase");
  let dipDays = 0;
  for (const d of dayDates) {
    try {
      const ph = await resolveCyclePhase(d);
      if (ph.phase === "menstrual" || ph.phase === "luteal") dipDays++;
    } catch { /* unknown phase — not evidence */ }
  }
  const cycleExplains = dipDays >= 2;
  checks.push({
    check: "Cycle phase",
    explained: cycleExplains,
    note: cycleExplains
      ? `${dipDays} of ${days.length} flagged sessions fall in menstrual/luteal days — expected phase dip. No experiment; re-evaluate next phase.`
      : "Not concentrated in menstrual/luteal days — doesn't explain it.",
  });
  if (cycleExplains) return { checks, explanation: checks[checks.length - 1] };

  // 4.2 illness — RHR >= +2bpm vs 7d baseline AND temp dev >= +0.3°C overlapping streak
  const streakStart = new Date(Math.min(...dayDates.map((d) => d.getTime())) - 86_400_000);
  const readiness = await prisma.dailyReadiness.findMany({
    where: { day: { gte: new Date(streakStart.getTime() - 8 * 86_400_000) } },
    orderBy: { day: "asc" },
    select: { day: true, restingHeartRate: true, temperatureDeviation: true },
  });
  const inStreak = readiness.filter((r) => days.includes(dstr(r.day)));
  const before = readiness.filter((r) => r.day < streakStart && r.restingHeartRate != null);
  const baseRhr = before.length >= 3
    ? before.reduce((a, b) => a + b.restingHeartRate!, 0) / before.length
    : null;
  const rhrUp = baseRhr != null && inStreak.some((r) => r.restingHeartRate != null && r.restingHeartRate - baseRhr >= 2);
  const tempUp = inStreak.some((r) => (r.temperatureDeviation ?? 0) >= 0.3);
  const ill = rhrUp && tempUp;
  checks.push({
    check: "Illness",
    explained: ill,
    note: ill
      ? "RHR ≥ +2 bpm over baseline AND temp deviation ≥ +0.3°C during the streak — physiology says illness/strain. Rest protocol; re-check in 5 days."
      : "RHR and temperature normal — ruled out.",
  });
  if (ill) return { checks, explanation: checks[checks.length - 1] };

  // 4.3 visit / travel — >= 2 flagged sessions inside partner-present or travel context
  const ctxLogs = await prisma.lifeContextLog.findMany({
    where: { day: { gte: streakStart } },
    include: { def: { select: { label: true, groupKey: true } } },
  });
  const travelTags = await prisma.activityTag.findMany({
    where: { timestamp: { gte: streakStart } },
    select: { tag: true, timestamp: true },
  });
  const visitDays = new Set<string>();
  for (const l of ctxLogs) {
    if (l.def?.label === "Shared bed (with partner)" || l.def?.label === "Urgent Meeting/Flight") {
      visitDays.add(dstr(l.day));
    }
  }
  for (const t of travelTags) {
    if (/travel|flight/i.test(t.tag)) visitDays.add(dstr(t.timestamp));
  }
  const visitOverlap = days.filter((d) => visitDays.has(d)).length;
  const visit = visitOverlap >= 2;
  checks.push({
    check: "Visit / travel",
    explained: visit,
    note: visit
      ? `${visitOverlap} flagged sessions fall in a visit/travel context — forecast applied, no experiment.`
      : "No visit/travel context overlap — ruled out.",
  });
  if (visit) return { checks, explanation: checks[checks.length - 1] };

  // 4.4 sleep debt — 3-day mean TST >= 60 min below 60-night baseline
  const sleeps = await prisma.dailySleep.findMany({
    where: { totalSleepDuration: { not: null } },
    orderBy: { day: "desc" },
    take: 60,
    select: { day: true, totalSleepDuration: true },
  });
  const recent3 = sleeps.slice(0, 3).map((s) => s.totalSleepDuration!);
  const base60 = sleeps.map((s) => s.totalSleepDuration!);
  const debt =
    recent3.length === 3 &&
    base60.length >= 20 &&
    base60.reduce((a, b) => a + b, 0) / base60.length -
      recent3.reduce((a, b) => a + b, 0) / recent3.length >=
      3600;
  checks.push({
    check: "Sleep debt",
    explained: debt,
    note: debt
      ? "3-day sleep ≥ 60 min under your 60-night baseline — sleep IS the candidate; sleep-side test routed first."
      : "Sleep in normal range — ruled out.",
  });
  if (debt) return { checks, explanation: checks[checks.length - 1] };

  // 4.5 overreach — >= 5 consecutive loading weeks (fatigue composite proxy)
  const recentSessions = await prisma.workoutSession.findMany({
    where: { completedAt: { not: null } },
    orderBy: { date: "desc" },
    take: 60,
    select: { date: true },
  });
  const weeks = new Set<string>();
  for (const s2 of recentSessions) {
    const d = s2.date;
    const dow = d.getUTCDay() || 7;
    const ws = new Date(d);
    ws.setUTCDate(d.getUTCDate() - (dow - 1));
    weeks.add(dstr(ws));
  }
  const sortedWeeks = [...weeks].sort().reverse();
  let consecutive = 0;
  for (let i = 0; i < sortedWeeks.length; i++) {
    if (i === 0) { consecutive = 1; continue; }
    const prev = new Date(sortedWeeks[i - 1] + "T00:00:00Z").getTime();
    const cur = new Date(sortedWeeks[i] + "T00:00:00Z").getTime();
    if (Math.abs((prev - cur) / (7 * 86_400_000) - 1) < 0.5) consecutive++;
    else break;
  }
  const overreach = consecutive >= 5;
  checks.push({
    check: "Overreach / deload due",
    explained: overreach,
    note: overreach
      ? `${consecutive} consecutive loading weeks — deload is due; run it before diagnosing anything.`
      : "Loading pattern normal — ruled out.",
  });
  if (overreach) return { checks, explanation: checks[checks.length - 1] };

  return { checks, explanation: null };
}

// ── Ranking (§5.3) ──────────────────────────────────────────────────────

export async function rankCandidates(flagged: SessionQuality[]): Promise<RankedCandidate[]> {
  const states = await prisma.diagnoseCandidateState.findMany();
  const stateById = new Map(states.map((s) => [s.candidateId, s]));

  const flaggedDays = new Set(flagged.map((f) => f.date));
  const windowStart = new Date(Date.now() - 56 * 86_400_000);
  const tags = await prisma.activityTag.findMany({
    where: { timestamp: { gte: windowStart } },
    select: { tag: true, timestamp: true },
  });
  const tagDays = new Map<string, Set<string>>();
  for (const t of tags) {
    const set = tagDays.get(t.tag.toLowerCase()) ?? new Set<string>();
    set.add(dstr(t.timestamp));
    tagDays.set(t.tag.toLowerCase(), set);
  }
  // baseline (non-flagged) session days over the same window: approximate
  // from all logged days minus flagged
  const allTagDays = new Set<string>();
  for (const s of tagDays.values()) for (const d of s) allTagDays.add(d);

  const now = Date.now();
  const ranked: RankedCandidate[] = [];
  for (const def of CANDIDATE_LIBRARY) {
    const st = stateById.get(def.id);
    const status = st?.status ?? "untested";
    const effClass = status === "context" ? "context" : def.class;
    if (st?.parkedUntil && st.parkedUntil.getTime() > now) continue;
    if (status === "confirmed") continue; // already a rule

    // evidence: share of flagged days carrying an evidence tag minus share
    // of other logged days carrying it, clamped [0.1, 1]
    let onFlagged = 0;
    let onOther = 0;
    let otherDays = 0;
    const evTagSets = def.evidenceTags
      .map((t) => tagDays.get(t.toLowerCase()))
      .filter((x): x is Set<string> => !!x);
    const hasEv = (d: string) => evTagSets.some((set) => set.has(d));
    for (const d of flaggedDays) if (hasEv(d)) onFlagged++;
    for (const d of allTagDays) {
      if (flaggedDays.has(d)) continue;
      otherDays++;
      if (hasEv(d)) onOther++;
    }
    const evidence = Math.min(1, Math.max(0.1,
      onFlagged / Math.max(flaggedDays.size, 1) - (otherDays ? onOther / otherDays : 0)));

    const prior = st?.prior ?? def.prior;
    const score = evidence * prior * FEASIBILITY[effClass];

    ranked.push({
      id: def.id,
      label: def.label,
      class: effClass,
      score: Math.round(score * 1000) / 1000,
      evidence: Math.round(evidence * 100) / 100,
      prior,
      status,
      testableNow: effClass === "crossover" && status !== "declined",
      honestLabel:
        effClass === "crossover"
          ? "Testable now — randomized experiment"
          : effClass === "one_way"
            ? "One-way change only — long washout makes A/B impossible; tracked against your projected trend, labeled weak evidence"
            : effClass === "trend_only"
              ? "Acts through slow adaptation — shown as a 28-day trend, never an experiment"
              : "Context — balanced across experiments, never proposed",
    });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

// ── Orchestrator: evaluate + persist ────────────────────────────────────

/**
 * Advance the Diagnose state machine for one category. Called from the
 * Findings page load (idempotent; cheap when DORMANT).
 */
export async function evaluateDiagnose(category: "strength" | "run") {
  const userId = await getCurrentUserId();

  const open = await prisma.diagnoseFlow.findFirst({
    where: { category, closedAt: null },
    orderBy: { triggeredAt: "desc" },
    include: { runs: { orderBy: { createdAt: "desc" } } },
  });

  const sessions =
    category === "strength" ? await strengthSessionQuality() : await runSessionQuality();

  // Self-resolution watch (§4): between TRIGGERED and RUNNING, 3 straight
  // sessions at z >= -0.25 close the flow as regression to the mean.
  if (open && ["TRIGGERED", "CANDIDATES_RANKED", "PROPOSED"].includes(open.state)) {
    const after = sessions.filter((s) => s.date > dstr(open.triggeredAt));
    const lastThree = after.slice(-3);
    if (lastThree.length === 3 && lastThree.every((s) => s.zScore >= SELF_RESOLVE_Z)) {
      await prisma.diagnoseFlow.update({
        where: { id: open.id },
        data: { state: "SELF_RESOLVED", closedAt: new Date(), closedAs: "self_resolved" },
      });
      // §8: RTM counter — raise this category's trigger threshold after >= 2.
      // (v1 records the event; threshold raising lands with more history.)
      return evaluateDiagnose(category);
    }
    return open;
  }

  if (open) return open; // running/verdict flows advance via explicit actions

  // Debounce: no re-trigger within 14 days of the last closed flow.
  const lastClosed = await prisma.diagnoseFlow.findFirst({
    where: { category, closedAt: { not: null } },
    orderBy: { closedAt: "desc" },
    select: { closedAt: true },
  });
  if (lastClosed?.closedAt && Date.now() - lastClosed.closedAt.getTime() < DEBOUNCE_DAYS * 86_400_000) {
    return null;
  }

  const streak = streakFired(sessions);
  if (!streak) return null;

  // TRIGGERED → context checks → CONTEXT_EXPLAINED | CANDIDATES_RANKED
  const { checks, explanation } = await runContextChecks(streak);
  if (explanation) {
    return prisma.diagnoseFlow.create({
      data: {
        userId,
        category,
        state: "CONTEXT_EXPLAINED",
        flaggedSessions: JSON.stringify(streak),
        contextResult: JSON.stringify(checks),
        closedAt: new Date(),
        closedAs: "context_explained",
      },
    });
  }

  const ranked = await rankCandidates(streak);
  const top = ranked.find((r) => r.testableNow);
  return prisma.diagnoseFlow.create({
    data: {
      userId,
      category,
      state: top ? "PROPOSED" : "EXHAUSTED",
      flaggedSessions: JSON.stringify(streak),
      contextResult: JSON.stringify(checks),
      queue: JSON.stringify(ranked),
      currentCandidateId: top?.id ?? null,
      ...(top ? {} : { closedAt: new Date(), closedAs: "exhausted" }),
    },
  });
}
