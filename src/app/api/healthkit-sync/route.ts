import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dateStrToUTC } from "@/lib/date-utils";
import { apiError } from "@/lib/utils";

// Allow up to 5 minutes for large backfills (e.g. 16-day HAE re-exports).
export const maxDuration = 300;

// --- Processing functions per spec ---

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

interface CycleEntry {
  date: string;
  menstrualFlow?: string | null;
  cervicalMucusQuality?: string | null;
  ovulationTestResult?: string | null;
}

async function processMetrics(metrics: MetricEntry[]): Promise<number> {
  let count = 0;

  for (const metric of metrics) {
    if (!Array.isArray(metric.data)) continue;

    console.log("[HealthKit] metric name received:", metric.name);

    switch (metric.name) {
      case "heart_rate": {
        // Batch upserts inside a transaction — one DB round-trip per batch
        // instead of one per sample. ~60x faster than sequential awaits.
        const hrRows = metric.data
          .filter((d) => (d.Avg ?? d.qty) && d.date)
          .map((d) => ({
            bpm: Math.round((d.Avg ?? d.qty)!),
            timestamp: new Date(d.date),
          }));
        const BATCH = 500;
        for (let i = 0; i < hrRows.length; i += BATCH) {
          const batch = hrRows.slice(i, i + BATCH);
          await prisma.$transaction(
            batch.map((r) =>
              prisma.heartRateSample.upsert({
                where: { timestamp_source: { timestamp: r.timestamp, source: "apple-watch" } },
                update: { bpm: r.bpm },
                create: { bpm: r.bpm, source: "apple-watch", timestamp: r.timestamp },
              }),
            ),
          );
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
                where: { timestamp_source: { timestamp: r.timestamp, source: "apple-watch-resting" } },
                update: { bpm: r.bpm },
                create: { bpm: r.bpm, source: "apple-watch-resting", timestamp: r.timestamp },
              }),
            ),
          );
        }
        count += rhrRows.length;
        break;
      }

      case "step_count":
        for (const d of metric.data) {
          if (!d.qty || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          // Check if Oura already has this day — only overwrite steps (Apple Watch more accurate)
          const existing = await prisma.dailyActivity.findUnique({
            where: { day },
          });
          if (existing) {
            await prisma.dailyActivity.update({
              where: { day },
              data: { steps: Math.round(d.qty) },
            });
          }
          count++;
        }
        break;

      case "active_energy":
        for (const d of metric.data) {
          if (!d.qty || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          const existing = await prisma.dailyActivity.findUnique({
            where: { day },
          });
          if (existing) {
            await prisma.dailyActivity.update({
              where: { day },
              data: { activeCalories: Math.round(d.qty) },
            });
          }
          count++;
        }
        break;

      case "weight_body_mass":
        for (const d of metric.data) {
          if (!d.qty || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          const weightKg = d.qty * 0.453592;
          await prisma.weightLog.upsert({
            where: { day },
            update: { weightKg },
            create: { day, weightKg },
          });
          count++;
        }
        break;

      case "body_fat_percentage":
        for (const d of metric.data) {
          if (!d.qty || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          const existing = await prisma.weightLog.findUnique({
            where: { day },
          });
          if (existing) {
            await prisma.weightLog.update({
              where: { day },
              data: { bodyFatPct: d.qty },
            });
          } else {
            await prisma.weightLog.create({
              data: { day, weightKg: 0, bodyFatPct: d.qty },
            });
          }
          count++;
        }
        break;

      // --- Apple Watch running & fitness metrics (via Health Auto Export) ---

      case "walking_running_distance":
        for (const d of metric.data) {
          const val = d.Avg ?? d.qty;
          if (!val || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          await prisma.dailyRunningMetrics.upsert({
            where: { day },
            update: { walkingRunningDistance: val },
            create: { day, walkingRunningDistance: val },
          });
          count++;
        }
        break;

      case "physical_effort":
        for (const d of metric.data) {
          const val = d.Avg ?? d.qty;
          if (!val || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          await prisma.dailyRunningMetrics.upsert({
            where: { day },
            update: { physicalEffort: val },
            create: { day, physicalEffort: val },
          });
          count++;
        }
        break;

      case "respiratory_rate":
        for (const d of metric.data) {
          const val = d.Avg ?? d.qty;
          if (!val || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          await prisma.dailyRunningMetrics.upsert({
            where: { day },
            update: { respiratoryRate: val },
            create: { day, respiratoryRate: val },
          });
          count++;
        }
        break;

      case "vo2_max":
        for (const d of metric.data) {
          const val = d.Avg ?? d.qty;
          if (!val || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          await prisma.dailyVO2Max.upsert({
            where: { day },
            update: { vo2Max: val },
            create: { id: `hae-vo2-${d.date.substring(0, 10)}`, day, vo2Max: val },
          });
          count++;
        }
        break;

      // --- Placeholder cases: names are best guesses, update after a real run ---

      case "running_speed":
        for (const d of metric.data) {
          const val = d.Avg ?? d.qty;
          if (!val || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          await prisma.dailyRunningMetrics.upsert({
            where: { day },
            update: { runningSpeed: val },
            create: { day, runningSpeed: val },
          });
          count++;
        }
        break;

      case "running_power":
        for (const d of metric.data) {
          const val = d.Avg ?? d.qty;
          if (!val || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          await prisma.dailyRunningMetrics.upsert({
            where: { day },
            update: { runningPower: val },
            create: { day, runningPower: val },
          });
          count++;
        }
        break;

      case "ground_contact_time":
        for (const d of metric.data) {
          const val = d.Avg ?? d.qty;
          if (!val || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          await prisma.dailyRunningMetrics.upsert({
            where: { day },
            update: { groundContactTime: val },
            create: { day, groundContactTime: val },
          });
          count++;
        }
        break;

      case "vertical_oscillation":
        for (const d of metric.data) {
          const val = d.Avg ?? d.qty;
          if (!val || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          await prisma.dailyRunningMetrics.upsert({
            where: { day },
            update: { verticalOscillation: val },
            create: { day, verticalOscillation: val },
          });
          count++;
        }
        break;

      case "running_stride_length":
        for (const d of metric.data) {
          const val = d.Avg ?? d.qty;
          if (!val || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          await prisma.dailyRunningMetrics.upsert({
            where: { day },
            update: { strideLength: val },
            create: { day, strideLength: val },
          });
          count++;
        }
        break;

      case "cardio_recovery":
        for (const d of metric.data) {
          const val = d.Avg ?? d.qty;
          if (!val || !d.date) continue;
          const day = dateStrToUTC(d.date.substring(0, 10));
          await prisma.dailyRunningMetrics.upsert({
            where: { day },
            update: { cardioRecovery: val },
            create: { day, cardioRecovery: val },
          });
          count++;
        }
        break;

      default:
        break;
    }
  }

  return count;
}

async function processWorkouts(workouts: WorkoutEntry[]): Promise<number> {
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
        const BATCH = 500;
        for (let i = 0; i < points.length; i += BATCH) {
          const batch = points.slice(i, i + BATCH);
          const values = batch
            .map(
              (p) =>
                `(${p.bpm}, '${p.source}', '${p.timestamp.toISOString()}')`,
            )
            .join(",\n");
          await prisma.$executeRawUnsafe(`
            INSERT INTO "HeartRateSample" (bpm, source, timestamp)
            VALUES ${values}
            ON CONFLICT (timestamp, source) DO UPDATE SET bpm = EXCLUDED.bpm
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
      where: { externalId: w.id },
      update: updateData,
      create: {
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

async function processCycleTracking(entries: CycleEntry[]): Promise<number> {
  let count = 0;

  for (const entry of entries) {
    if (!entry.date) continue;
    const day = dateStrToUTC(entry.date.substring(0, 10));
    const flow = entry.menstrualFlow;

    let phase: string | null = null;
    if (flow && flow !== "none" && flow !== "unspecified") {
      phase = "menstrual";
    } else if (
      entry.ovulationTestResult === "positive" ||
      entry.ovulationTestResult === "luteinizing_hormone_surge"
    ) {
      phase = "ovulation";
    }

    if (phase) {
      // Manual entries take priority — only write if no manual entry exists for this day
      const existing = await prisma.cyclePhaseLog.findUnique({
        where: { day },
      });
      if (!existing || existing.source !== "manual") {
        await prisma.cyclePhaseLog.upsert({
          where: { day },
          update: { phase, source: "healthkit" },
          create: { day, phase, source: "healthkit" },
        });
        count++;
      }
    }
  }

  return count;
}

// --- Route handlers ---

export async function POST(request: NextRequest) {
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
      metricsCount = await processMetrics(data.metrics ?? []);
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

    await prisma.healthKitSync.create({
      data: {
        status,
        metrics: metricsCount,
        workouts: workoutsCount,
        details: `${metricsCount} metrics, ${workoutsCount} workouts, ${cycleCount} cycle entries${errors.length > 0 ? `. Errors: ${errors.join("; ")}` : ""}`,
      },
    });

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
      await prisma.healthKitSync.create({
        data: {
          status: "error",
          metrics: 0,
          workouts: 0,
          details: `Handler crashed: ${message.slice(0, 400)}`,
        },
      });
    } catch {
      // Logging failures shouldn't mask the original error.
    }
    const { status, body: errBody } = apiError(error);
    return NextResponse.json(errBody, { status });
  }
}

export async function GET() {
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
