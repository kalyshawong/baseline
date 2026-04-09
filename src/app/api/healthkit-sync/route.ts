import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dateStrToUTC } from "@/lib/date-utils";
import { apiError } from "@/lib/utils";

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

    switch (metric.name) {
      case "heart_rate":
        for (const d of metric.data) {
          const bpm = d.Avg ?? d.qty;
          if (!bpm || !d.date) continue;
          try {
            await prisma.heartRateSample.upsert({
              where: {
                timestamp_source: {
                  timestamp: new Date(d.date),
                  source: "apple-watch",
                },
              },
              update: { bpm: Math.round(bpm) },
              create: {
                bpm: Math.round(bpm),
                source: "apple-watch",
                timestamp: new Date(d.date),
              },
            });
            count++;
          } catch {
            // Skip duplicate/constraint errors
          }
        }
        break;

      case "resting_heart_rate":
        for (const d of metric.data) {
          if (!d.qty || !d.date) continue;
          try {
            await prisma.heartRateSample.upsert({
              where: {
                timestamp_source: {
                  timestamp: new Date(d.date),
                  source: "apple-watch-resting",
                },
              },
              update: { bpm: Math.round(d.qty) },
              create: {
                bpm: Math.round(d.qty),
                source: "apple-watch-resting",
                timestamp: new Date(d.date),
              },
            });
            count++;
          } catch {
            // Skip
          }
        }
        break;

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

    await prisma.healthKitWorkout.upsert({
      where: { externalId: w.id },
      update: {
        name: w.name,
        startedAt: new Date(w.start),
        endedAt: new Date(w.end),
        durationSeconds: Math.round(w.duration ?? 0),
        activeCalories: w.activeEnergyBurned?.qty ?? null,
        distance: w.distance?.qty ?? null,
        distanceUnit: w.distance?.units ?? null,
        avgHeartRate: w.heartRate?.data?.[0]?.Avg ?? null,
        maxHeartRate: w.heartRate?.data?.[0]?.Max ?? null,
        minHeartRate: w.heartRate?.data?.[0]?.Min ?? null,
      },
      create: {
        externalId: w.id,
        name: w.name,
        startedAt: new Date(w.start),
        endedAt: new Date(w.end),
        durationSeconds: Math.round(w.duration ?? 0),
        activeCalories: w.activeEnergyBurned?.qty ?? null,
        distance: w.distance?.qty ?? null,
        distanceUnit: w.distance?.units ?? null,
        avgHeartRate: w.heartRate?.data?.[0]?.Avg ?? null,
        maxHeartRate: w.heartRate?.data?.[0]?.Max ?? null,
        minHeartRate: w.heartRate?.data?.[0]?.Min ?? null,
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = body?.data ?? body; // Support both { data: { ... } } and flat
    const errors: string[] = [];

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
