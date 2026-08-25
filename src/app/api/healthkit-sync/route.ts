import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dateStrToUTC } from "@/lib/date-utils";
import { apiError } from "@/lib/utils";
import { getCurrentUserId } from "@/lib/current-user";

// Allow up to 5 minutes for large backfills (e.g. 16-day HAE re-exports).
export const maxDuration = 300;

// --- Processing functions per spec ---

/** Sum sample quantities per YYYY-MM-DD (date strings carry the sample's local offset). */
function sumByDay(
  data: Array<{ date: string; qty?: number }>,
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const d of data) {
    if (!d.qty || !d.date) continue;
    const day = d.date.substring(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + d.qty);
  }
  return byDay;
}

/** Last (Avg ?? qty) value per YYYY-MM-DD — for day-granular metrics that
 *  arrive as many per-sample rows (native pipeline). Matches the old
 *  sequential-overwrite behavior, in one write per day instead of hundreds. */
function lastPerDay(
  data: Array<{ date: string; qty?: number; Avg?: number }>,
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const d of data) {
    const val = d.Avg ?? d.qty;
    if (!val || !d.date) continue;
    byDay.set(d.date.substring(0, 10), val);
  }
  return byDay;
}

interface MetricEntry {
  name: string;
  units?: string;
  data: Array<{
    date: string;
    qty?: number;
    Min?: number;
    Avg?: number;
    Max?: number;
  }>;
}

interface WorkoutEntry {
  id: string;
  name: string;
  start: string;
  end: string;
  duration: number;
  activeEnergyBurned?: { qty: number; units: string };
  distance?: { qty: number; units: string };
  heartRate?: {
    data: Array<{ date: string; Min?: number; Avg?: number; Max?: number }>;
  };
}

/**
 * HAE's actual cycleTracking entry shape (verified 2026-05-28 via
 * diagnostic logging — the original Baseline spec from 2026-04 guessed
 * a `{date, menstrualFlow}` schema that HAE never sent).
 *
 * HAE serializes HealthKit's Cycle Tracking category as event records:
 *
 *   {
 *     "name": "Menstrual Flow" | "Contraceptive" | "Ovulation Test Result" | ...,
 *     "value": "Light" | "Medium" | "Heavy" | "Intrauterine Device" | "Positive" | ...,
 *     "start": "2026-05-15 00:00:00 -0400",
 *     "end":   "2026-05-15 23:59:59 -0400"
 *   }
 *
 * `start` is the load-bearing date — for daily-flow events that's the
 * date the user logged the period on. We bucket to that date's local
 * midnight to match NutritionLog.day's convention.
 */
interface CycleEntry {
  name?: string | null;
  value?: string | null;
  start?: string | null;
  end?: string | null;
  // Legacy fields retained so older payloads (or a future HAE schema
  // revision back to the original format) still parse.
  date?: string | null;
  menstrualFlow?: string | null;
  cervicalMucusQuality?: string | null;
  ovulationTestResult?: string | null;
}

async function processMetrics(
  metrics: MetricEntry[],
  source: "native-app" | "health-auto-export",
): Promise<number> {
  const userId = await getCurrentUserId();
  // Only HAE may write daily activity totals: HAE exports full-day
  // aggregates, but the native plugin sends since-watermark samples, so
  // any sum it computes is a PARTIAL day — writing it would clobber
  // Oura's correct daily summary. Native's value-add is the sample-level
  // streams (HR, running metrics, workouts, cycle), not dailies.
  const mayWriteDailyTotals = source === "health-auto-export";
  let count = 0;

  for (const metric of metrics) {
    if (!Array.isArray(metric.data)) continue;

    console.log("[HealthKit] metric name received:", metric.name);

    switch (metric.name) {
      case "heart_rate": {
        // createMany + skipDuplicates: one INSERT per batch instead of one
        // upsert statement per sample. HR samples are immutable once
        // recorded, so "insert if new, ignore if seen" is the right
        // semantic — and it's what lets a 4,000-sample native re-send fit
        // inside the function budget (per-sample upserts were pushing
        // syncs past maxDuration; killed functions never logged or 200'd,
        // so the phone's watermark never advanced: 2026-08-19).
        const hrRows = metric.data
          .filter((d) => (d.Avg ?? d.qty) && d.date)
          .map((d) => ({
            userId: userId,
            bpm: Math.round((d.Avg ?? d.qty)!),
            source: "apple-watch",
            timestamp: new Date(d.date),
          }));
        const BATCH = 1000;
        for (let i = 0; i < hrRows.length; i += BATCH) {
          await prisma.heartRateSample.createMany({
            data: hrRows.slice(i, i + BATCH),
            skipDuplicates: true,
          });
        }
        count += hrRows.length;
        break;
      }

      case "resting_heart_rate": {
        const rhrRows = metric.data
          .filter((d) => d.qty && d.date)
          .map((d) => ({
            bpm: Math.round(d.qty!),
            timestamp: new Date(d.date),
          }));
        const RHR_BATCH = 500;
        for (let i = 0; i < rhrRows.length; i += RHR_BATCH) {
          const batch = rhrRows.slice(i, i + RHR_BATCH);
          await prisma.$transaction(
            batch.map((r) =>
              prisma.heartRateSample.upsert({
                where: { userId_timestamp_source: { userId: userId, timestamp: r.timestamp, source: "apple-watch-resting" } },
                update: { bpm: r.bpm },
                create: { userId: userId, bpm: r.bpm, source: "apple-watch-resting", timestamp: r.timestamp },
              }),
            ),
          );
        }
        count += rhrRows.length;
        break;
      }

      case "step_count": {
        // SUM per day first. HAE sends one aggregate row per day (sum of a
        // 1-row group = same value), but the NATIVE plugin sends raw
        // per-sample rows — writing each one directly clobbered the day's
        // total with a single sample's count (e.g. steps=14). Only updates
        // rows that already exist (Oura creates the day). NOTE: on days
        // where both pipelines report, last-writer wins; Oura's daily
        // summary re-corrects on each Oura sync.
        if (!mayWriteDailyTotals) break;
        const stepsByDay = sumByDay(metric.data);
        for (const [dayStr, total] of stepsByDay) {
          await prisma.dailyActivity.updateMany({
            where: { userId: userId, day: dateStrToUTC(dayStr) },
            data: { steps: Math.round(total) },
          });
        }
        count += metric.data.length;
        break;
      }

      case "active_energy": {
        // Same per-day aggregation as step_count (same native clobber bug).
        if (!mayWriteDailyTotals) break;
        const energyByDay = sumByDay(metric.data);
        for (const [dayStr, total] of energyByDay) {
          await prisma.dailyActivity.updateMany({
            where: { userId: userId, day: dateStrToUTC(dayStr) },
            data: { activeCalories: Math.round(total) },
          });
        }
        count += metric.data.length;
        break;
      }

      case "weight_body_mass": {
        const weightRows = metric.data.filter((d) => d.qty && d.date);
        if (weightRows.length > 0) {
          await prisma.$transaction(
            weightRows.map((d) => {
              const day = dateStrToUTC(d.date.substring(0, 10));
              const weightKg = d.qty! * 0.453592;
              return prisma.weightLog.upsert({
                where: { userId_day: { userId: userId, day } },
                update: { weightKg },
                create: { userId: userId, day, weightKg },
              });
            }),
          );
        }
        count += weightRows.length;
        break;
      }

      case "body_fat_percentage": {
        const bfRows = metric.data.filter((d) => d.qty && d.date);
        if (bfRows.length > 0) {
          await prisma.$transaction(
            bfRows.map((d) => {
              const day = dateStrToUTC(d.date.substring(0, 10));
              return prisma.weightLog.upsert({
                where: { userId_day: { userId: userId, day } },
                update: { bodyFatPct: d.qty },
                create: { userId: userId, day, weightKg: 0, bodyFatPct: d.qty },
              });
            }),
          );
        }
        count += bfRows.length;
        break;
      }

      // --- Apple Watch running & fitness metrics (via Health Auto Export) ---

      case "walking_running_distance": {
        // One write PER DAY, not per sample — run days carry hundreds of
        // samples and the old per-sample upserts were sequential round-trips
        // (a major cause of the killed-function watermark loop, 2026-08-20).
        for (const [dayStr, val] of lastPerDay(metric.data)) {
          const day = dateStrToUTC(dayStr);
          await prisma.dailyRunningMetrics.upsert({
            where: { userId_day: { userId: userId, day } },
            update: { walkingRunningDistance: val },
            create: { userId: userId, day, walkingRunningDistance: val },
          });
        }
        count += metric.data.length;
        break;
      }

      case "physical_effort": {
        // One write PER DAY, not per sample — run days carry hundreds of
        // samples and the old per-sample upserts were sequential round-trips
        // (a major cause of the killed-function watermark loop, 2026-08-20).
        for (const [dayStr, val] of lastPerDay(metric.data)) {
          const day = dateStrToUTC(dayStr);
          await prisma.dailyRunningMetrics.upsert({
            where: { userId_day: { userId: userId, day } },
            update: { physicalEffort: val },
            create: { userId: userId, day, physicalEffort: val },
          });
        }
        count += metric.data.length;
        break;
      }

      case "respiratory_rate": {
        // One write PER DAY, not per sample — run days carry hundreds of
        // samples and the old per-sample upserts were sequential round-trips
        // (a major cause of the killed-function watermark loop, 2026-08-20).
        for (const [dayStr, val] of lastPerDay(metric.data)) {
          const day = dateStrToUTC(dayStr);
          await prisma.dailyRunningMetrics.upsert({
            where: { userId_day: { userId: userId, day } },
            update: { respiratoryRate: val },
            create: { userId: userId, day, respiratoryRate: val },
          });
        }
        count += metric.data.length;
        break;
      }

      case "vo2_max": {
        for (const [dayStr, val] of lastPerDay(metric.data)) {
          const day = dateStrToUTC(dayStr);
          await prisma.dailyVO2Max.upsert({
            where: { userId_day: { userId: userId, day } },
            update: { vo2Max: val },
            create: { id: `hae-vo2-${dayStr}`, userId: userId, day, vo2Max: val },
          });
        }
        count += metric.data.length;
        break;
      }

      // --- Placeholder cases: names are best guesses, update after a real run ---

      case "running_speed": {
        // One write PER DAY, not per sample — run days carry hundreds of
        // samples and the old per-sample upserts were sequential round-trips
        // (a major cause of the killed-function watermark loop, 2026-08-20).
        for (const [dayStr, val] of lastPerDay(metric.data)) {
          const day = dateStrToUTC(dayStr);
          await prisma.dailyRunningMetrics.upsert({
            where: { userId_day: { userId: userId, day } },
            update: { runningSpeed: val },
            create: { userId: userId, day, runningSpeed: val },
          });
        }
        count += metric.data.length;
        break;
      }

      case "running_power": {
        // One write PER DAY, not per sample — run days carry hundreds of
        // samples and the old per-sample upserts were sequential round-trips
        // (a major cause of the killed-function watermark loop, 2026-08-20).
        for (const [dayStr, val] of lastPerDay(metric.data)) {
          const day = dateStrToUTC(dayStr);
          await prisma.dailyRunningMetrics.upsert({
            where: { userId_day: { userId: userId, day } },
            update: { runningPower: val },
            create: { userId: userId, day, runningPower: val },
          });
        }
        count += metric.data.length;
        break;
      }

      case "ground_contact_time": {
        // One write PER DAY, not per sample — run days carry hundreds of
        // samples and the old per-sample upserts were sequential round-trips
        // (a major cause of the killed-function watermark loop, 2026-08-20).
        for (const [dayStr, val] of lastPerDay(metric.data)) {
          const day = dateStrToUTC(dayStr);
          await prisma.dailyRunningMetrics.upsert({
            where: { userId_day: { userId: userId, day } },
            update: { groundContactTime: val },
            create: { userId: userId, day, groundContactTime: val },
          });
        }
        count += metric.data.length;
        break;
      }

      case "vertical_oscillation": {
        // One write PER DAY, not per sample — run days carry hundreds of
        // samples and the old per-sample upserts were sequential round-trips
        // (a major cause of the killed-function watermark loop, 2026-08-20).
        for (const [dayStr, val] of lastPerDay(metric.data)) {
          const day = dateStrToUTC(dayStr);
          await prisma.dailyRunningMetrics.upsert({
            where: { userId_day: { userId: userId, day } },
            update: { verticalOscillation: val },
            create: { userId: userId, day, verticalOscillation: val },
          });
        }
        count += metric.data.length;
        break;
      }

      case "running_stride_length": {
        // One write PER DAY, not per sample — run days carry hundreds of
        // samples and the old per-sample upserts were sequential round-trips
        // (a major cause of the killed-function watermark loop, 2026-08-20).
        for (const [dayStr, val] of lastPerDay(metric.data)) {
          const day = dateStrToUTC(dayStr);
          await prisma.dailyRunningMetrics.upsert({
            where: { userId_day: { userId: userId, day } },
            update: { strideLength: val },
            create: { userId: userId, day, strideLength: val },
          });
        }
        count += metric.data.length;
        break;
      }

      case "cardio_recovery": {
        // One write PER DAY, not per sample — run days carry hundreds of
        // samples and the old per-sample upserts were sequential round-trips
        // (a major cause of the killed-function watermark loop, 2026-08-20).
        for (const [dayStr, val] of lastPerDay(metric.data)) {
          const day = dateStrToUTC(dayStr);
          await prisma.dailyRunningMetrics.upsert({
            where: { userId_day: { userId: userId, day } },
            update: { cardioRecovery: val },
            create: { userId: userId, day, cardioRecovery: val },
          });
        }
        count += metric.data.length;
        break;
      }

      default:
        break;
    }
  }

  return count;
}

async function processWorkouts(workouts: WorkoutEntry[]): Promise<number> {
  const userId = await getCurrentUserId();
  let count = 0;

  for (const w of workouts) {
    if (!w.id || !w.name || !w.start || !w.end) continue;

    let avgHR: number | null = null;
    let maxHR: number | null = null;
    let minHR: number | null = null;

    // HAE typically embeds a per-minute HR time series inside the workout
    // object: `heartRate.data` is an array of { date, Avg, Min, Max } points.
    // Two things to do with it:
    //   1. Insert each point into HeartRateSample so the workout card's HR
    //      chart can render even when HAE isn't sending `heart_rate` as a
    //      top-level metric (e.g., user disabled background HR in HAE to
    //      avoid duplicate work with Oura — but still wants workout HR).
    //   2. Compute avg/max/min from the FULL series, not just data[0]
    //      (which was the prior bug — only saw the first minute's stats).
    const hrSeries = w.heartRate?.data ?? [];
    if (hrSeries.length > 0) {
      const points = hrSeries
        .filter((p) => p.date && (p.Avg != null || p.Min != null || p.Max != null))
        .map((p) => ({
          bpm: Math.round((p.Avg ?? ((p.Min ?? 0) + (p.Max ?? 0)) / 2)!),
          timestamp: new Date(p.date),
          source: "apple-watch-workout",
        }))
        .filter((p) => Number.isFinite(p.bpm) && p.bpm > 0);

      if (points.length > 0) {
        // SQLite's Prisma adapter doesn't expose `skipDuplicates` on
        // createMany (the typed option errors as `never`). Use raw
        // INSERT … ON CONFLICT DO UPDATE — same pattern as the bulk HR
        // sample insert at line ~70. Batches keep payload bounded.
        const userId = await getCurrentUserId();
        const BATCH = 500;
        for (let i = 0; i < points.length; i += BATCH) {
          const batch = points.slice(i, i + BATCH);
          const values = batch
            .map(
              (p) =>
                `('${userId}', ${p.bpm}, '${p.source}', '${p.timestamp.toISOString()}')`,
            )
            .join(",\n");
          // Multi-tenant: include userId and match the compound unique
          // (userId, timestamp, source) in ON CONFLICT.
          await prisma.$executeRawUnsafe(`
            INSERT INTO "HeartRateSample" ("userId", bpm, source, timestamp)
            VALUES ${values}
            ON CONFLICT ("userId", timestamp, source) DO UPDATE SET bpm = EXCLUDED.bpm
          `);
        }

        const bpms = points.map((p) => p.bpm);
        avgHR = Math.round(bpms.reduce((s, v) => s + v, 0) / bpms.length);
        maxHR = Math.max(...bpms);
        minHR = Math.min(...bpms);
      }
    }

    // Fallback: derive from already-stored HR samples in the workout window
    // (e.g. background `heart_rate` metric synced earlier).
    if (avgHR == null) {
      const startedAt = new Date(w.start);
      const endedAt = new Date(w.end);
      const hrStats = await prisma.heartRateSample.aggregate({
        where: {
          source: { startsWith: "apple" },
          timestamp: { gte: startedAt, lte: endedAt },
        },
        _avg: { bpm: true },
        _max: { bpm: true },
        _min: { bpm: true },
      });
      if (hrStats._avg.bpm != null) {
        avgHR = Math.round(hrStats._avg.bpm);
        maxHR = hrStats._max.bpm;
        minHR = hrStats._min.bpm;
      }
    }

    // Only overwrite HR fields on update if we actually computed new HR.
    // Prevents a re-export that lacks HR samples from wiping a previously-
    // populated HR series (which happened before — the unconditional update
    // path was nulling out good data on every re-sync).
    const updateData: Record<string, unknown> = {
      name: w.name,
      startedAt: new Date(w.start),
      endedAt: new Date(w.end),
      durationSeconds: Math.round(w.duration ?? 0),
      activeCalories: w.activeEnergyBurned?.qty ?? null,
      distance: w.distance?.qty ?? null,
      distanceUnit: w.distance?.units ?? null,
    };
    if (avgHR != null) {
      updateData.avgHeartRate = avgHR;
      updateData.maxHeartRate = maxHR;
      updateData.minHeartRate = minHR;
    }

    await prisma.healthKitWorkout.upsert({
      where: { userId_externalId: { userId: userId, externalId: w.id } },
      update: updateData,
      create: {
        userId: userId,
        externalId: w.id,
        name: w.name,
        startedAt: new Date(w.start),
        endedAt: new Date(w.end),
        durationSeconds: Math.round(w.duration ?? 0),
        activeCalories: w.activeEnergyBurned?.qty ?? null,
        distance: w.distance?.qty ?? null,
        distanceUnit: w.distance?.units ?? null,
        avgHeartRate: avgHR,
        maxHeartRate: maxHR,
        minHeartRate: minHR,
      },
    });
    count++;
  }

  return count;
}

/**
 * Normalize HAE's value strings ("Light", "Light Flow", "light",
 * "Positive", etc.) to lowercase + trimmed form so the equality
 * checks below work regardless of HAE's casing choices.
 */
function normalizeCycleValue(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().trim();
}

/**
 * Decide which CyclePhaseLog phase, if any, a single HAE cycleTracking
 * entry implies. Returns null for entries that don't anchor a phase
 * (Contraceptive, Cervical Mucus Quality, etc. — informational but
 * not phase-defining).
 *
 * Menstrual flow values per HAE samples + HK docs: "Light", "Medium",
 * "Heavy", "Unspecified", "None". Anything > "None"/"Unspecified" is
 * a real menstrual log → menstrual phase.
 *
 * Ovulation test values per HK docs: "Positive", "Negative",
 * "Indeterminate", "LH Surge". Positive / LH Surge → ovulation phase.
 */
function phaseForCycleEntry(entry: CycleEntry): string | null {
  // Legacy schema fallback: `{ date, menstrualFlow }` — kept in case
  // HAE reverts or a future iOS app sends the original shape.
  if (entry.menstrualFlow != null) {
    const f = normalizeCycleValue(entry.menstrualFlow);
    if (f && f !== "none" && f !== "unspecified") return "menstrual";
  }
  if (entry.ovulationTestResult != null) {
    const r = normalizeCycleValue(entry.ovulationTestResult);
    if (r === "positive" || r === "luteinizing_hormone_surge" || r === "lh surge") {
      return "ovulation";
    }
  }

  // HAE event schema: `{ name, value, start, end }`.
  const name = normalizeCycleValue(entry.name);
  const value = normalizeCycleValue(entry.value);
  if (name === "menstrual flow" || name === "menstruation") {
    if (value && value !== "none" && value !== "unspecified") return "menstrual";
  }
  if (name === "ovulation test result" || name === "ovulation test") {
    if (value === "positive" || value === "lh surge" || value === "luteinizing hormone surge") {
      return "ovulation";
    }
  }
  return null;
}

/**
 * Pick the entry's local-day Date for bucketing into CyclePhaseLog.
 * Prefers the legacy `date` field, then HAE's `start` field. Returns
 * null when nothing parses.
 */
function entryDay(entry: CycleEntry): Date | null {
  const raw = entry.date ?? entry.start ?? null;
  if (!raw) return null;
  // Both shapes start with a YYYY-MM-DD prefix; reuse the legacy
  // dateStrToUTC helper to anchor at UTC midnight of that calendar
  // day (matches the other daily tables' convention).
  return dateStrToUTC(raw.substring(0, 10));
}

async function processCycleTracking(entries: CycleEntry[]): Promise<number> {
  // HAE re-sends the ENTIRE cycle history (~1,500 entries) with every
  // export, and the old per-entry findUnique+upsert made that ~3,000
  // sequential DB round-trips — minutes of wall clock, the single biggest
  // contributor to killed syncs (2026-08-20). Now: dedupe to one phase per
  // day in memory, fetch the manual-override days in ONE query, and batch
  // the remaining upserts.
  const userId = await getCurrentUserId();

  const phaseByDay = new Map<string, { day: Date; phase: string }>();
  for (const entry of entries) {
    const phase = phaseForCycleEntry(entry);
    if (!phase) continue; // Contraceptive / informational entries skipped here
    const day = entryDay(entry);
    if (!day) continue;
    // Last entry for a day wins — same as the old sequential behavior.
    phaseByDay.set(day.toISOString(), { day, phase });
  }
  if (phaseByDay.size === 0) return 0;

  const days = Array.from(phaseByDay.values()).map((v) => v.day);

  // Manual entries take priority — exclude their days in one shot.
  const manual = await prisma.cyclePhaseLog.findMany({
    where: { userId, day: { in: days }, source: "manual" },
    select: { day: true },
  });
  const manualDays = new Set(manual.map((m) => m.day.toISOString()));

  const writes = Array.from(phaseByDay.values()).filter(
    (v) => !manualDays.has(v.day.toISOString()),
  );

  const BATCH = 200;
  for (let i = 0; i < writes.length; i += BATCH) {
    await prisma.$transaction(
      writes.slice(i, i + BATCH).map((v) =>
        prisma.cyclePhaseLog.upsert({
          where: { userId_day: { userId, day: v.day } },
          update: { phase: v.phase, source: "healthkit" },
          create: { userId, day: v.day, phase: v.phase, source: "healthkit" },
        }),
      ),
    );
  }
  return writes.length;
}

// --- Route handlers ---

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  // Hoisted so the catch block can flip the tombstone row to "error".
  let logRowId: string | null = null;
  try {
    // Auth
    const authHeader = request.headers.get("authorization");
    const expectedKey = process.env.HEALTHKIT_SYNC_KEY;
    if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      // Observability fix (2026-05-27): previously this 401 was silent —
      // no log, no HealthKitSync row, no surface anywhere. That hid 16+
      // days of failures because HAE retried daily and got rejected on
      // every attempt with zero downstream signal. Now: log to stderr
      // AND write a "unauthorized" row so the dashboard / GET endpoint /
      // sync staleness indicator can see something happened.
      const headerPresent = authHeader != null;
      const keyConfigured = !!expectedKey;
      console.error(
        `[HealthKit] 401 unauthorized — keyConfigured=${keyConfigured}, headerPresent=${headerPresent}, headerPrefix=${authHeader?.slice(0, 12) ?? "<none>"}`,
      );
      try {
        await prisma.healthKitSync.create({
          data: {
            userId: userId,
            status: "unauthorized",
            metrics: 0,
            workouts: 0,
            details: !keyConfigured
              ? "HEALTHKIT_SYNC_KEY env var not set on the server."
              : !headerPresent
                ? "Request missing Authorization header. HAE may not have an API key configured."
                : "Authorization header didn't match HEALTHKIT_SYNC_KEY. HAE's stored key is probably stale.",
          },
        });
      } catch {
        // Don't let a logging failure mask the auth failure.
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = body?.data ?? body; // Support both { data: { ... } } and flat

    // Which pipeline sent this? The Swift plugin sets X-Baseline-Client
    // (URLSession does NOT inherit the WebView's appended UA, which is why
    // UA sniffing alone mislabeled every native post as HAE); the UA check
    // stays for any fetch()es made from inside the WebView.
    const source =
      request.headers.get("x-baseline-client") === "native-app" ||
      (request.headers.get("user-agent") ?? "").includes("BaselineNative")
        ? "native-app"
        : "health-auto-export";

    // Tombstone-first logging: create the row BEFORE processing, update at
    // the end. If Vercel kills the function mid-processing (timeout), the
    // row survives as "processing" — before this, killed syncs vanished
    // entirely (data written, no log, no 200, client watermark stuck,
    // infinite re-send: observed 2026-08-19).
    try {
      const row = await prisma.healthKitSync.create({
        data: { userId: userId, status: "processing", source, metrics: 0, workouts: 0 },
      });
      logRowId = row.id;
    } catch {
      /* logging must never block the sync */
    }

    console.log(`[HealthKit] payload keys: ${Object.keys(data).join(", ")}`);
    if (data.cycleTracking?.length > 0) {
      console.log(`[HealthKit] cycleTracking sample:`, JSON.stringify(data.cycleTracking.slice(0, 3)));
    }
    const errors: string[] = [];

    // Diagnostic: print one summary line so we can see at a glance exactly
    // what HAE included in this export. Useful when metrics=1 in the
    // response and we need to know whether HR was even in the payload.
    const inboundMetrics: Array<{ name: string; points: number }> = (
      data.metrics ?? []
    ).map((m: MetricEntry) => ({
      name: m.name,
      points: Array.isArray(m.data) ? m.data.length : 0,
    }));
    console.log(
      `[HealthKit] inbound payload: ${inboundMetrics.length} metric types, ${(data.workouts ?? []).length} workouts, ${(data.cycleTracking ?? []).length} cycle entries`,
    );
    console.log(
      `[HealthKit] metric breakdown: ${
        inboundMetrics.length === 0
          ? "<none>"
          : inboundMetrics.map((m) => `${m.name}(${m.points})`).join(", ")
      }`,
    );

    let metricsCount = 0;
    let workoutsCount = 0;
    let cycleCount = 0;

    try {
      metricsCount = await processMetrics(data.metrics ?? [], source);
    } catch (e) {
      errors.push(`metrics: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      workoutsCount = await processWorkouts(data.workouts ?? []);
    } catch (e) {
      errors.push(`workouts: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      cycleCount = await processCycleTracking(data.cycleTracking ?? []);
    } catch (e) {
      errors.push(`cycle: ${e instanceof Error ? e.message : String(e)}`);
    }

    const status = errors.length === 0 ? "success" : errors.length === 3 ? "failed" : "partial";

    // Diagnostic: dump the actual shape of the inbound payload to the
    // details field so we can debug "what is HAE actually sending"
    // questions without scraping stdout. Captures (a) every top-level
    // key in `data` with its array length, and (b) the metric-name
    // list (some HAE versions smuggle category data like menstrual
    // flow into `metrics` instead of `cycleTracking`). Truncated to
    // keep the details field reasonable.
    // SAFE TO REMOVE once HAE cycle ingestion is confirmed working.
    const topLevelShape = Object.entries(data ?? {})
      .map(([k, v]) => {
        if (Array.isArray(v)) return `${k}[${v.length}]`;
        if (v == null) return `${k}=null`;
        return `${k}=<${typeof v}>`;
      })
      .join(" ");
    const metricNamesList = inboundMetrics
      .map((m) => `${m.name}(${m.points})`)
      .join(",")
      .slice(0, 2000); // hard cap so details doesn't balloon

    // Sample cycleTracking entries. Diagnostic finding (2026-05-28):
    // HAE actually sends event-shape entries — `{name, value, start,
    // end}` — NOT the `{date, menstrualFlow}` shape the original spec
    // assumed. Capture (a) a breakdown by `name` so we know exactly
    // which HK category types HAE is exporting, and (b) one verbatim
    // sample for schema reference.
    const cycleEntries = Array.isArray(data.cycleTracking)
      ? data.cycleTracking
      : [];
    const cycleByName: Record<string, number> = {};
    for (const c of cycleEntries) {
      const k = (c as { name?: string })?.name ?? "<no_name>";
      cycleByName[k] = (cycleByName[k] ?? 0) + 1;
    }
    const cycleBreakdown = Object.entries(cycleByName)
      .map(([n, c]) => `${n}:${c}`)
      .join(",");
    const cycleSample =
      cycleEntries.length > 0
        ? JSON.stringify(cycleEntries[0]).slice(0, 600)
        : "<empty>";

    const finalLog = {
      status,
      metrics: metricsCount,
      workouts: workoutsCount,
      details: `${metricsCount} metrics, ${workoutsCount} workouts, ${cycleCount} cycle entries${errors.length > 0 ? `. Errors: ${errors.join("; ")}` : ""} | shape: ${topLevelShape} | cycle_breakdown: ${cycleBreakdown || "<empty>"} | cycle_sample: ${cycleSample} | metric_names: ${metricNamesList || "<none>"}`,
    };
    if (logRowId) {
      await prisma.healthKitSync.update({ where: { id: logRowId }, data: finalLog });
    } else {
      await prisma.healthKitSync.create({
        data: { userId: userId, ...finalLog },
      });
    }

    return NextResponse.json({
      ok: true,
      status,
      metrics: metricsCount,
      workouts: workoutsCount,
      cycle: cycleCount,
    });
  } catch (error) {
    // Previously silent. Now: log to stderr + record a "error" row in
    // HealthKitSync so a sync that explodes (malformed body, bug in a
    // processor, etc.) doesn't disappear into the void.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[HealthKit] sync handler crashed:", message);
    try {
      const errLog = {
        status: "error",
        details: `Handler crashed: ${message.slice(0, 400)}`,
      };
      if (logRowId) {
        await prisma.healthKitSync.update({ where: { id: logRowId }, data: errLog });
      } else {
        await prisma.healthKitSync.create({
          data: { userId: userId, metrics: 0, workouts: 0, ...errLog },
        });
      }
    } catch {
      // Logging failures shouldn't mask the original error.
    }
    const { status, body: errBody } = apiError(error);
    return NextResponse.json(errBody, { status });
  }
}

export async function GET() {
  const userId = await getCurrentUserId();
  try {
    const syncs = await prisma.healthKitSync.findMany({
      orderBy: { syncedAt: "desc" },
      take: 20,
    });
    return NextResponse.json(syncs);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
