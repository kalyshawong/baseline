import { prisma } from "./db";
import { ouraFetch, OuraScopeError } from "./oura";

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n));
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

interface OuraActivity {
  id: string;
  day: string;
  score: number | null;
  active_calories: number | null;
  total_calories: number | null;
  steps: number | null;
  equivalent_walking_distance: number | null;
  high_activity_time: number | null;
  medium_activity_time: number | null;
  low_activity_time: number | null;
  sedentary_time: number | null;
  resting_time: number | null;
  meters_to_target: number | null;
  met?: { interval: number; items: number[] };
}

// --- Oura Expansion Interfaces ---

interface OuraSpO2 {
  id: string;
  day: string;
  spo2_percentage: { average: number | null } | null;
}

interface OuraEnhancedTag {
  id: string;
  tag_type_code: string;
  start_time: string;
  end_time: string | null;
  start_day: string;
  end_day: string | null;
  comment: string | null;
}

interface OuraWorkoutRecord {
  id: string;
  activity: string;
  calories: number | null;
  day: string;
  distance: number | null;
  end_datetime: string;
  intensity: string | null;
  label: string | null;
  source: string | null;
  start_datetime: string;
}

interface OuraSession {
  id: string;
  day: string;
  start_datetime: string;
  end_datetime: string;
  type: string;
  heart_rate: { interval: number; items: number[]; timestamp: string } | null;
  heart_rate_variability: { interval: number; items: number[]; timestamp: string } | null;
  mood: string | null;
}

interface OuraSleepTime {
  id: string;
  day: string;
  optimal_bedtime: { day_tz: string; start_offset: number; end_offset: number } | null;
  recommendation: string | null;
  status: string | null;
}

interface OuraResilience {
  id: string;
  day: string;
  level: string;
  contributors: { sleep_recovery: number | null; daytime_recovery: number | null; stress: number | null };
}

interface OuraVO2Max {
  id: string;
  day: string;
  vo2_max: number | null;
}

interface OuraPersonalInfo {
  id: string;
  age: number | null;
  weight: number | null;
  height: number | null;
  biological_sex: string | null;
  email: string | null;
}

const TAG_MAP: Record<string, { tag: string; category: string }> = {
  "tag_generic_nocaffeine":   { tag: "No Caffeine",   category: "caffeine" },
  "tag_generic_caffeine":     { tag: "Caffeine",      category: "caffeine" },
  "tag_generic_alcohol":      { tag: "Alcohol",       category: "alcohol" },
  "tag_generic_noalcohol":    { tag: "No Alcohol",    category: "alcohol" },
  "tag_generic_late_meal":    { tag: "Late Meal",     category: "custom" },
  "tag_generic_big_meal":     { tag: "Big Meal",      category: "custom" },
  "tag_generic_meditation":   { tag: "Meditation",    category: "meditation" },
  "tag_generic_breathing_exercise": { tag: "Breathing", category: "breathing" },
  "tag_generic_sauna":        { tag: "Sauna",         category: "exercise" },
  "tag_generic_ice_bath":     { tag: "Ice Bath",      category: "exercise" },
  "tag_generic_sick":         { tag: "Sick",          category: "custom" },
  "tag_generic_stressful_day":{ tag: "Stressful Day", category: "custom" },
  "tag_generic_relaxing_day": { tag: "Relaxing Day",  category: "custom" },
  "tag_generic_workout":      { tag: "Workout",       category: "exercise" },
  "tag_generic_rest_day":     { tag: "Rest Day",      category: "exercise" },
  "tag_generic_travel":       { tag: "Travel",        category: "custom" },
  "tag_generic_jet_lag":      { tag: "Jet Lag",       category: "custom" },
};

function avgFromSamples(obj: { items: number[] } | null): number | null {
  if (!obj?.items?.length) return null;
  const valid = obj.items.filter(v => v > 0);
  if (!valid.length) return null;
  return Math.round(valid.reduce((s, v) => s + v, 0) / valid.length);
}

export async function syncPersonalInfo(): Promise<void> {
  const info = await ouraFetch<OuraPersonalInfo>("personal_info", {});
  await prisma.userProfile.upsert({
    where: { id: 1 },
    update: {
      ...(info.weight != null && { bodyWeightKg: info.weight }),
      ...(info.height != null && { heightCm: Math.round(info.height * 100) }),
      ...(info.age != null && { age: info.age }),
      ...(info.biological_sex != null && { sex: info.biological_sex }),
    },
    create: {
      id: 1,
      bodyWeightKg: info.weight,
      heightCm: info.height ? Math.round(info.height * 100) : undefined,
      age: info.age ?? undefined,
      sex: info.biological_sex ?? undefined,
    },
  });
}

export async function syncOuraData(lookbackDays = 7): Promise<{
  readiness: number;
  sleep: number;
  stress: number;
  heartrate: number;
  activity: number;
  spo2: number;
  tags: number;
  workouts: number;
  sessions: number;
  sleepTime: number;
  resilience: number;
  vo2max: number;
  needsReauth: boolean;
}> {
  const startDate = formatDate(daysAgo(lookbackDays));
  const endDate = formatDate(new Date());
  const params = { start_date: startDate, end_date: endDate };

  let readinessCount = 0;
  let sleepCount = 0;
  let stressCount = 0;
  let hrCount = 0;
  let activityCount = 0;
  let spo2Count = 0;
  let tagsCount = 0;
  let workoutsCount = 0;
  let sessionsCount = 0;
  let sleepTimeCount = 0;
  let resilienceCount = 0;
  let vo2maxCount = 0;
  let needsReauth = false;
  const errors: string[] = [];

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
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Readiness sync failed:", msg);
    errors.push(`readiness: ${msg}`);
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
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Sleep sync failed:", msg);
    errors.push(`sleep: ${msg}`);
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
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Stress sync failed:", msg);
    errors.push(`stress: ${msg}`);
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
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Heart rate sync failed:", msg);
    errors.push(`heartrate: ${msg}`);
  }

  // Sync daily activity
  try {
    const activity = await ouraFetch<OuraListResponse<OuraActivity>>(
      "daily_activity",
      params
    );
    for (const a of activity.data) {
      // Compute total MET minutes if available (rough: sum of items × interval / 60)
      const metMinutes = a.met?.items
        ? Math.round(
            a.met.items.reduce((s, v) => s + v, 0) * ((a.met.interval ?? 60) / 60)
          )
        : null;

      await prisma.dailyActivity.upsert({
        where: { id: a.id },
        update: {
          score: a.score,
          activeCalories: a.active_calories,
          totalCalories: a.total_calories,
          steps: a.steps,
          equivalentWalkingDistance: a.equivalent_walking_distance,
          highActivityTime: a.high_activity_time,
          mediumActivityTime: a.medium_activity_time,
          lowActivityTime: a.low_activity_time,
          sedentaryTime: a.sedentary_time,
          restingTime: a.resting_time,
          metMinutes,
        },
        create: {
          id: a.id,
          day: new Date(a.day),
          score: a.score,
          activeCalories: a.active_calories,
          totalCalories: a.total_calories,
          steps: a.steps,
          equivalentWalkingDistance: a.equivalent_walking_distance,
          highActivityTime: a.high_activity_time,
          mediumActivityTime: a.medium_activity_time,
          lowActivityTime: a.low_activity_time,
          sedentaryTime: a.sedentary_time,
          restingTime: a.resting_time,
          metMinutes,
        },
      });
      activityCount++;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Activity sync failed:", msg);
    errors.push(`activity: ${msg}`);
  }

  // Sync SpO2
  try {
    const spo2 = await ouraFetch<OuraListResponse<OuraSpO2>>("daily_spo2", params);
    for (const r of spo2.data) {
      await prisma.dailySpO2.upsert({
        where: { id: r.id },
        update: { avgSpO2: r.spo2_percentage?.average ?? null },
        create: {
          id: r.id,
          day: new Date(r.day),
          avgSpO2: r.spo2_percentage?.average ?? null,
        },
      });
      spo2Count++;
    }
  } catch (e) {
    if (e instanceof OuraScopeError) {
      console.warn(e.message);
      needsReauth = true;
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("SpO2 sync failed:", msg);
      errors.push(`spo2: ${msg}`);
    }
  }

  // Sync Enhanced Tags → ActivityTag
  try {
    const tags = await ouraFetch<OuraListResponse<OuraEnhancedTag>>("enhanced_tag", params);
    for (const t of tags.data) {
      // Skip if already ingested
      const existing = await prisma.activityTag.findUnique({ where: { ouraTagId: t.id } });
      if (existing) { tagsCount++; continue; }

      const mapped = TAG_MAP[t.tag_type_code];
      if (!mapped) continue; // Unknown tag type — skip

      await prisma.activityTag.create({
        data: {
          tag: mapped.tag,
          category: mapped.category,
          timestamp: new Date(t.start_time),
          metadata: t.comment ? JSON.stringify({ comment: t.comment }) : null,
          ouraTagId: t.id,
          source: "oura",
        },
      });
      tagsCount++;
    }
  } catch (e) {
    if (e instanceof OuraScopeError) {
      console.warn(e.message);
      needsReauth = true;
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Enhanced tags sync failed:", msg);
      errors.push(`tags: ${msg}`);
    }
  }

  // Sync Oura Workouts (skip apple_health source — already captured via HealthKit)
  try {
    const workouts = await ouraFetch<OuraListResponse<OuraWorkoutRecord>>("workout", params);
    for (const w of workouts.data) {
      if (w.source === "apple_health") continue;

      const startedAt = new Date(w.start_datetime);
      const endedAt = new Date(w.end_datetime);
      const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

      await prisma.ouraWorkout.upsert({
        where: { id: w.id },
        update: {
          activity: w.activity,
          calories: w.calories,
          distance: w.distance,
          intensity: w.intensity,
          label: w.label,
          source: w.source,
          startedAt,
          endedAt,
          durationSeconds,
        },
        create: {
          id: w.id,
          day: new Date(w.day),
          activity: w.activity,
          calories: w.calories,
          distance: w.distance,
          intensity: w.intensity,
          label: w.label,
          source: w.source,
          startedAt,
          endedAt,
          durationSeconds,
        },
      });
      workoutsCount++;
    }
  } catch (e) {
    if (e instanceof OuraScopeError) {
      console.warn(e.message);
      needsReauth = true;
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Oura workouts sync failed:", msg);
      errors.push(`workouts: ${msg}`);
    }
  }

  // Sync Sessions (meditation, breathing, naps)
  try {
    const sessions = await ouraFetch<OuraListResponse<OuraSession>>("session", params);
    for (const s of sessions.data) {
      const startedAt = new Date(s.start_datetime);
      const endedAt = new Date(s.end_datetime);
      const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

      await prisma.ouraSession.upsert({
        where: { id: s.id },
        update: {
          type: s.type,
          startedAt,
          endedAt,
          durationSeconds,
          avgHeartRate: avgFromSamples(s.heart_rate),
          avgHrv: avgFromSamples(s.heart_rate_variability),
          mood: s.mood,
        },
        create: {
          id: s.id,
          day: new Date(s.day),
          type: s.type,
          startedAt,
          endedAt,
          durationSeconds,
          avgHeartRate: avgFromSamples(s.heart_rate),
          avgHrv: avgFromSamples(s.heart_rate_variability),
          mood: s.mood,
        },
      });
      sessionsCount++;
    }
  } catch (e) {
    if (e instanceof OuraScopeError) {
      console.warn(e.message);
      needsReauth = true;
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Sessions sync failed:", msg);
      errors.push(`sessions: ${msg}`);
    }
  }

  // Sync Sleep Time (bedtime recommendations)
  try {
    const sleepTime = await ouraFetch<OuraListResponse<OuraSleepTime>>("sleep_time", params);
    for (const st of sleepTime.data) {
      await prisma.sleepTimeRecommendation.upsert({
        where: { id: st.id },
        update: {
          optimalBedtimeStart: st.optimal_bedtime?.start_offset ?? null,
          optimalBedtimeEnd: st.optimal_bedtime?.end_offset ?? null,
          recommendation: st.recommendation,
          status: st.status,
        },
        create: {
          id: st.id,
          day: new Date(st.day),
          optimalBedtimeStart: st.optimal_bedtime?.start_offset ?? null,
          optimalBedtimeEnd: st.optimal_bedtime?.end_offset ?? null,
          recommendation: st.recommendation,
          status: st.status,
        },
      });
      sleepTimeCount++;
    }
  } catch (e) {
    if (e instanceof OuraScopeError) {
      console.warn(e.message);
      needsReauth = true;
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Sleep time sync failed:", msg);
      errors.push(`sleepTime: ${msg}`);
    }
  }

  // Sync Resilience
  try {
    const resilience = await ouraFetch<OuraListResponse<OuraResilience>>("daily_resilience", params);
    for (const r of resilience.data) {
      await prisma.dailyResilience.upsert({
        where: { id: r.id },
        update: {
          level: r.level,
          sleepRecovery: r.contributors.sleep_recovery,
          daytimeRecovery: r.contributors.daytime_recovery,
          stress: r.contributors.stress,
        },
        create: {
          id: r.id,
          day: new Date(r.day),
          level: r.level,
          sleepRecovery: r.contributors.sleep_recovery,
          daytimeRecovery: r.contributors.daytime_recovery,
          stress: r.contributors.stress,
        },
      });
      resilienceCount++;
    }
  } catch (e) {
    if (e instanceof OuraScopeError) {
      console.warn(e.message);
      needsReauth = true;
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Resilience sync failed:", msg);
      errors.push(`resilience: ${msg}`);
    }
  }

  // VO2 Max sourced from Apple Watch via Health Auto Export, not Oura (returns 404)
  // try {
  //   const vo2 = await ouraFetch<OuraListResponse<OuraVO2Max>>("vo2_max", params);
  //   for (const v of vo2.data) {
  //     await prisma.dailyVO2Max.upsert({
  //       where: { id: v.id },
  //       update: { vo2Max: v.vo2_max },
  //       create: {
  //         id: v.id,
  //         day: new Date(v.day),
  //         vo2Max: v.vo2_max,
  //       },
  //     });
  //     vo2maxCount++;
  //   }
  // } catch (e) {
  //   if (e instanceof OuraScopeError) {
  //     console.warn(e.message);
  //     needsReauth = true;
  //   } else {
  //     const msg = e instanceof Error ? e.message : String(e);
  //     if (msg.includes("404")) {
  //       // VO2 Max not supported
  //     } else {
  //       console.error("VO2 Max sync failed:", msg);
  //       errors.push(`vo2max: ${msg}`);
  //     }
  //   }
  // }

  // Log sync result with accurate status
  const totalEndpoints = 12;
  const status = errors.length === 0
    ? "success"
    : errors.length === totalEndpoints
      ? "failed"
      : "partial";

  await prisma.syncLog.create({
    data: {
      status,
      details: JSON.stringify({
        readiness: readinessCount,
        sleep: sleepCount,
        stress: stressCount,
        heartrate: hrCount,
        activity: activityCount,
        spo2: spo2Count,
        tags: tagsCount,
        workouts: workoutsCount,
        sessions: sessionsCount,
        sleepTime: sleepTimeCount,
        resilience: resilienceCount,
        vo2max: vo2maxCount,
        ...(needsReauth && { needsReauth: true }),
        ...(errors.length > 0 && { errors }),
      }),
    },
  });

  return {
    readiness: readinessCount,
    sleep: sleepCount,
    stress: stressCount,
    heartrate: hrCount,
    activity: activityCount,
    spo2: spo2Count,
    tags: tagsCount,
    workouts: workoutsCount,
    sessions: sessionsCount,
    sleepTime: sleepTimeCount,
    resilience: resilienceCount,
    vo2max: vo2maxCount,
    needsReauth,
  };
}
