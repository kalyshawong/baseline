// STEP 3 — run after load.ts:
//
//   npx tsx scripts/migration/recompute-baselines.ts
//
// Computes per-signal UserBaseline rows (n / mean / sd / cv / maturity) for the
// user from their loaded data. This is also the function the sync pipeline
// should call going forward — extract it into lib/ later so every new sync
// refreshes baselines.
//
// IMPORTANT (per the personalization model): the maturity RULES below are shared
// engine config. The resulting per-user mean/sd/cv are what calibrations key off
// — e.g. the HRV-CV overreaching cutoff reads this row's `cv`, never a hardcoded
// 10%. That's how "my calibrations stay irrelevant to other users" is enforced.

import { PrismaClient } from "@prisma/client";
import { USER_ID } from "./_shared";

const prisma = new PrismaClient();

// signal -> where the numeric value lives + how many days until we trust it.
const SIGNALS: { signal: string; model: string; field: string; minDays: number }[] = [
  { signal: "sleepScore", model: "dailySleep", field: "score", minDays: 14 },
  { signal: "sleepDuration", model: "dailySleep", field: "totalSleepDuration", minDays: 14 },
  { signal: "hrv", model: "dailySleep", field: "averageHrv", minDays: 21 },
  { signal: "rhr", model: "dailyReadiness", field: "restingHeartRate", minDays: 14 },
  { signal: "readiness", model: "dailyReadiness", field: "score", minDays: 14 },
  { signal: "stress", model: "dailyStress", field: "stressHigh", minDays: 14 },
  // cyclePhase is categorical (needs >=1 full cycle, ~35d) — handle separately
  // once you compute cyclesObserved from phase transitions. Not numeric.
];

function stats(values: number[]) {
  const n = values.length;
  if (n === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const cv = mean !== 0 ? sd / mean : null;
  const sorted = [...values].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(n - 1, Math.floor(p * n))];
  return { mean, sd, cv, p20: pct(0.2), p80: pct(0.8) };
}

async function main() {
  for (const { signal, model, field, minDays } of SIGNALS) {
    const rows: any[] = await (prisma as any)[model].findMany({
      where: { userId: USER_ID },
      orderBy: { day: "asc" },
    });

    const usable = rows.filter((r) => r[field] != null);
    const values = usable.map((r) => Number(r[field]));
    const days = usable.map((r) => new Date(r.day));
    const n = values.length;

    const firstDay = n ? days[0] : null;
    const lastDay = n ? days[n - 1] : null;
    const spanDays =
      firstDay && lastDay
        ? Math.round((lastDay.getTime() - firstDay.getTime()) / 86_400_000)
        : 0;
    const s = stats(values);
    const isMature = n >= minDays;
    const maturityPct = Math.min(1, n / minDays);

    await prisma.userBaseline.upsert({
      where: { userId_signal: { userId: USER_ID, signal } },
      update: {
        n, firstDay, lastDay, spanDays,
        mean: s?.mean ?? null, sd: s?.sd ?? null, cv: s?.cv ?? null,
        p20: s?.p20 ?? null, p80: s?.p80 ?? null,
        isMature, maturityPct,
      },
      create: {
        userId: USER_ID, signal,
        n, firstDay, lastDay, spanDays,
        mean: s?.mean ?? null, sd: s?.sd ?? null, cv: s?.cv ?? null,
        p20: s?.p20 ?? null, p80: s?.p80 ?? null,
        isMature, maturityPct,
      },
    });

    console.log(
      `${signal.padEnd(14)} n=${String(n).padStart(3)}  ` +
        `mature=${isMature ? "yes" : "no "}  ${Math.round(maturityPct * 100)}%` +
        (s ? `  mean=${s.mean.toFixed(1)} cv=${s.cv ? s.cv.toFixed(3) : "—"}` : "")
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
