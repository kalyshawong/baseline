import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { welchTTest } from "@/lib/correlation";

/**
 * Soreness → running-performance analyzer.
 *
 * For each body part with enough logged sore days, compares running-day
 * outcomes (speed, cardio recovery, physical effort) on sore vs not-sore
 * days via Welch's t-test. Hypothesis-generating, same statistical posture
 * as the meal→GI analyzer: small-n honest, never causal.
 */

export interface SorenessFinding {
  bodyPart: string;
  metric: string; // display label
  soreMean: number;
  notSoreMean: number;
  pctDiff: number; // (sore − notSore) / notSore, signed
  p: number;
  nSore: number;
  nNotSore: number;
  /** Direction-aware one-liner. */
  line: string;
}

const MIN_GROUP = 4;

const METRICS: {
  key: "runningSpeed" | "cardioRecovery" | "physicalEffort";
  label: string;
  unit: string;
  /** true when higher is better (frames the one-liner). */
  higherIsBetter: boolean;
}[] = [
  { key: "runningSpeed", label: "run speed", unit: "km/h", higherIsBetter: true },
  { key: "cardioRecovery", label: "cardio recovery", unit: "bpm", higherIsBetter: true },
  { key: "physicalEffort", label: "physical effort", unit: "", higherIsBetter: false },
];

export async function analyzeSoreness(): Promise<SorenessFinding[]> {
  const userId = getCurrentUserId();
  const [logs, running] = await Promise.all([
    prisma.sorenessLog.findMany({ where: { userId }, select: { day: true, bodyPart: true } }),
    prisma.dailyRunningMetrics.findMany({
      where: { userId },
      select: { day: true, runningSpeed: true, cardioRecovery: true, physicalEffort: true },
    }),
  ]);
  if (logs.length === 0 || running.length === 0) return [];

  const soreDaysByPart = new Map<string, Set<string>>();
  for (const l of logs) {
    const set = soreDaysByPart.get(l.bodyPart) ?? new Set<string>();
    set.add(l.day.toISOString().slice(0, 10));
    soreDaysByPart.set(l.bodyPart, set);
  }

  const findings: SorenessFinding[] = [];

  for (const [part, soreDays] of soreDaysByPart) {
    for (const m of METRICS) {
      const sore: number[] = [];
      const notSore: number[] = [];
      for (const r of running) {
        const v = r[m.key];
        if (v == null) continue;
        (soreDays.has(r.day.toISOString().slice(0, 10)) ? sore : notSore).push(v);
      }
      if (sore.length < MIN_GROUP || notSore.length < MIN_GROUP) continue;

      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const soreMean = mean(sore);
      const notSoreMean = mean(notSore);
      if (notSoreMean === 0) continue;
      const { p } = welchTTest(sore, notSore);
      if (p >= 0.15) continue;

      const pctDiff = (soreMean - notSoreMean) / Math.abs(notSoreMean);
      const dirWord = pctDiff > 0 ? "higher" : "lower";
      findings.push({
        bodyPart: part,
        metric: m.label,
        soreMean,
        notSoreMean,
        pctDiff,
        p,
        nSore: sore.length,
        nNotSore: notSore.length,
        line: `${cap(part)}-sore days: ${m.label} ${Math.abs(pctDiff * 100).toFixed(1)}% ${dirWord} (${soreMean.toFixed(1)} vs ${notSoreMean.toFixed(1)}${m.unit ? " " + m.unit : ""}, p=${p.toFixed(3)}, n=${sore.length} vs ${notSore.length})`,
      });
    }
  }

  return findings.sort((a, b) => a.p - b.p);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
