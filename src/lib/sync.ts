import { prisma } from "./db";
import { ouraFetch } from "./oura";

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

interface OuraListResponse<T> {
  data: T[];
  next_token?: string;
}

interface OuraReadiness {
  id: string;
  day: string;
  score: number | null;
  temperature_deviation: number | null;
  temperature_trend_deviation: number | null;
  timestamp: string;
  contributors: {
    activity_balance: number | null;
    body_temperature: number | null;
    hrv_balance: number | null;
    recovery_index: number | null;
    resting_heart_rate: number | null;
    sleep_balance: number | null;
  };
}

interface OuraSleep {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  contributors: {
    deep_sleep: number | null;
    efficiency: number | null;
    latency: number | null;
    rem_sleep: number | null;
    restfulness: number | null;
    timing: number | null;
    total_sleep: number | null;
  };
}

interface OuraSleepPeriod {
  id: string;
  day: string;
  total_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  light_sleep_duration: number | null;
  sleep_efficiency: number | null;
  latency: number | null;
  average_heart_rate: number | null;
  lowest_heart_rate: number | null;
  average_hrv: number | null;
}

interface OuraStress {
  id: string;
  day: string;
  stress_high: number | null;
  recovery_high: number | null;
  day_summary: string | null;
}

interface OuraHeartRate {
  bpm: number;
  source: string;
  timestamp: string;
}

export async function syncOuraData(lookbackDays = 7): Promise<{
  readiness: number;
  sleep: number;
  stress: number;
  heartrate: number;
}> {
  const startDate = formatDate(daysAgo(lookbackDays));
  const endDate = formatDate(new Date());
  const params = { start_date: startDate, end_date: endDate };

  let readinessCount = 0;
  let sleepCount = 0;
  let stressCount = 0;
  let hrCount = 0;

  // Sync readiness
  try {
    const readiness = await ouraFetch<OuraListResponse<OuraReadiness>>(
      "daily_readiness",
      params
    );
    for (const r of readiness.data) {
      await prisma.dailyReadiness.upsert({
        where: { id: r.id },
        update: {
          score: r.score,
          temperatureDeviation: r.temperature_deviation,
          temperatureTrendDeviation: r.temperature_trend_deviation,
          hrvBalance: r.contributors.hrv_balance,
          bodyTemperature: r.contributors.body_temperature,
          recoveryIndex: r.contributors.recovery_index,
          restingHeartRate: r.contributors.resting_heart_rate,
          sleepBalance: r.contributors.sleep_balance,
          activityBalance: r.contributors.activity_balance,
        },
        create: {
          id: r.id,
          day: new Date(r.day),
          score: r.score,
          temperatureDeviation: r.temperature_deviation,
          temperatureTrendDeviation: r.temperature_trend_deviation,
          hrvBalance: r.contributors.hrv_balance,
          bodyTemperature: r.contributors.body_temperature,
          recoveryIndex: r.contributors.recovery_index,
          restingHeartRate: r.contributors.resting_heart_rate,
          sleepBalance: r.contributors.sleep_balance,
          activityBalance: r.contributors.activity_balance,
        },
      });
      readinessCount++;
    }
  } catch (e) {
    console.error("Readiness sync failed:", e);
  }

  // Sync sleep (daily summary + period details)
  try {
    const sleep = await ouraFetch<OuraListResponse<OuraSleep>>(
      "daily_sleep",
      params
    );
    const periods = await ouraFetch<OuraListResponse<OuraSleepPeriod>>(
      "sleep",
      params
    );

    // Index period data by day (use the longest sleep period per day)
    const periodByDay = new Map<string, OuraSleepPeriod>();
    for (const p of periods.data) {
      const existing = periodByDay.get(p.day);
      if (
        !existing ||
        (p.total_sleep_duration ?? 0) > (existing.total_sleep_duration ?? 0)
      ) {
        periodByDay.set(p.day, p);
      }
    }

    for (const s of sleep.data) {
      const period = periodByDay.get(s.day);
      await prisma.dailySleep.upsert({
        where: { id: s.id },
        update: {
          score: s.score,
          totalSleepDuration: period?.total_sleep_duration,
          remSleepDuration: period?.rem_sleep_duration,
          deepSleepDuration: period?.deep_sleep_duration,
          lightSleepDuration: period?.light_sleep_duration,
          sleepEfficiency: period?.sleep_efficiency,
          latency: period?.latency,
          averageHeartRate: period?.average_heart_rate,
          lowestHeartRate: period?.lowest_heart_rate,
          averageHrv: period?.average_hrv,
        },
        create: {
          id: s.id,
          day: new Date(s.day),
          score: s.score,
          totalSleepDuration: period?.total_sleep_duration,
          remSleepDuration: period?.rem_sleep_duration,
          deepSleepDuration: period?.deep_sleep_duration,
          lightSleepDuration: period?.light_sleep_duration,
          sleepEfficiency: period?.sleep_efficiency,
          latency: period?.latency,
          averageHeartRate: period?.average_heart_rate,
          lowestHeartRate: period?.lowest_heart_rate,
          averageHrv: period?.average_hrv,
        },
      });
      sleepCount++;
    }
  } catch (e) {
    console.error("Sleep sync failed:", e);
  }

  // Sync stress
  try {
    const stress = await ouraFetch<OuraListResponse<OuraStress>>(
      "daily_stress",
      params
    );
    for (const s of stress.data) {
      await prisma.dailyStress.upsert({
        where: { id: s.id },
        update: {
          stressHigh: s.stress_high,
          recoveryHigh: s.recovery_high,
          daySummary: s.day_summary,
        },
        create: {
          id: s.id,
          day: new Date(s.day),
          stressHigh: s.stress_high,
          recoveryHigh: s.recovery_high,
          daySummary: s.day_summary,
        },
      });
      stressCount++;
    }
  } catch (e) {
    console.error("Stress sync failed:", e);
  }

  // Sync heart rate (use datetime params, store resting samples)
  try {
    const startDt = `${startDate}T00:00:00+00:00`;
    const endDt = `${endDate}T23:59:59+00:00`;
    const hrData = await ouraFetch<OuraListResponse<OuraHeartRate>>(
      "heartrate",
      { start_datetime: startDt, end_datetime: endDt }
    );
    for (const hr of hrData.data) {
      if (hr.source !== "rest" && hr.source !== "sleep") continue;
      try {
        await prisma.heartRateSample.upsert({
          where: {
            timestamp_source: {
              timestamp: new Date(hr.timestamp),
              source: hr.source,
            },
          },
          update: { bpm: hr.bpm },
          create: {
            bpm: hr.bpm,
            source: hr.source,
            timestamp: new Date(hr.timestamp),
          },
        });
        hrCount++;
      } catch {
        // Skip duplicate key errors
      }
    }
  } catch (e) {
    console.error("Heart rate sync failed:", e);
  }

  // Log sync result
  await prisma.syncLog.create({
    data: {
      status: "success",
      details: JSON.stringify({
        readiness: readinessCount,
        sleep: sleepCount,
        stress: stressCount,
        heartrate: hrCount,
      }),
    },
  });

  return {
    readiness: readinessCount,
    sleep: sleepCount,
    stress: stressCount,
    heartrate: hrCount,
  };
}
