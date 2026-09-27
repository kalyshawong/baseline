import { GarminConnect } from "garmin-connect";
import type { IGarminTokens } from "garmin-connect/dist/garmin/types";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runAsUser } from "@/lib/current-user";
import { dateStrToUTC } from "@/lib/date-utils";

/**
 * Garmin Connect (unofficial) daily pull.
 *
 * Garmin's partner Health API is closed to new applicants (frozen 2026), so
 * this uses the same connectapi.garmin.com endpoints the Garmin Connect app
 * calls, through the `garmin-connect` library. It is pilot-only, can break
 * whenever Garmin changes the app, and is never the way a public product
 * would do this — but it is the only route to Body Battery, Training
 * Load/Status, HRV Status and Training Readiness, none of which reach
 * Apple Health.
 *
 * Auth: a one-time login on Kalysha's Mac (scripts/garmin/link.ts) yields
 * OAuth tokens that live on GarminLink. The password is never stored. The
 * library refreshes the OAuth2 token as needed; we save whatever it holds
 * after each sync so the link keeps working.
 */

const GC = "https://connectapi.garmin.com";

// The cron runs with no session, and the tenant extension would scope (or
// ownership-check) every GarminLink read to the fallback user. Links are
// read with an un-extended client, like the demo seed; every WRITE below
// still goes through the extended client with the tenant pinned.
const globalForGarmin = globalThis as unknown as { garminRaw?: PrismaClient };
const raw = () => (globalForGarmin.garminRaw ??= new PrismaClient());

export interface GarminDayResult {
  day: string;
  fields: Record<string, unknown>;
  errors: string[];
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function int(v: unknown): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n);
}
function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

async function safe<T>(label: string, errors: string[], fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function clientForLink(linkId: string): Promise<{ client: GarminConnect; displayName: string | null }> {
  const link = await raw().garminLink.findUnique({ where: { id: linkId } });
  if (!link) throw new Error("GarminLink not found");
  const tokens = JSON.parse(link.tokens) as IGarminTokens;
  const client = new GarminConnect({ username: "", password: "" });
  client.loadToken(tokens.oauth1, tokens.oauth2);
  return { client, displayName: link.displayName };
}

/** Pull one calendar day from every endpoint we care about. Never throws — per-endpoint errors are collected. */
export async function fetchGarminDay(client: GarminConnect, displayName: string | null, day: Date): Promise<GarminDayResult> {
  const d = ymd(day);
  const errors: string[] = [];
  const raw: Record<string, unknown> = {};

  const [bb, summary, sleep, hrv, stress, training, readiness] = await Promise.all([
    safe("bodyBattery", errors, () => client.get<unknown[]>(`${GC}/wellness-service/wellness/bodyBattery/reports/daily`, { startDate: d, endDate: d })),
    displayName
      ? safe("dailySummary", errors, () => client.get<Record<string, unknown>>(`${GC}/usersummary-service/usersummary/daily/${encodeURIComponent(displayName)}`, { calendarDate: d }))
      : Promise.resolve(null),
    safe("sleep", errors, () => client.getSleepData(day)),
    safe("hrv", errors, () => client.get<Record<string, unknown>>(`${GC}/hrv-service/hrv/${d}`)),
    safe("stress", errors, () => client.get<Record<string, unknown>>(`${GC}/wellness-service/wellness/dailyStress/${d}`)),
    safe("trainingStatus", errors, () => client.get<Record<string, unknown>>(`${GC}/metrics-service/metrics/trainingstatus/aggregated/${d}`)),
    safe("trainingReadiness", errors, () => client.get<unknown>(`${GC}/metrics-service/metrics/trainingreadiness/${d}`)),
  ]);
  raw.bodyBattery = bb; raw.dailySummary = summary; raw.sleep = sleep; raw.hrv = hrv; raw.stress = stress; raw.trainingStatus = training; raw.trainingReadiness = readiness;

  const fields: Record<string, unknown> = {};

  // Body Battery: daily report → charged / drained; high/low from the daily summary
  const bbDay = Array.isArray(bb) ? (bb.find((x) => (x as { date?: string }).date === d) ?? bb[0]) as Record<string, unknown> | undefined : undefined;
  fields.bodyBatteryCharged = int(bbDay?.charged);
  fields.bodyBatteryDrained = int(bbDay?.drained);
  fields.bodyBatteryHigh = int(summary?.bodyBatteryHighestValue);
  fields.bodyBatteryLow = int(summary?.bodyBatteryLowestValue);
  fields.restingHr = int(summary?.restingHeartRate);
  fields.stressAvg = int(summary?.averageStressLevel ?? (stress as Record<string, unknown> | null)?.avgStressLevel);

  // Sleep
  const sl = sleep as unknown as { dailySleepDTO?: Record<string, unknown>; sleepScores?: { overall?: { value?: unknown } }; avgOvernightHrv?: unknown; restingHeartRate?: unknown } | null;
  const dto = sl?.dailySleepDTO ?? {};
  const scores = (dto.sleepScores as { overall?: { value?: unknown } } | undefined) ?? sl?.sleepScores;
  fields.sleepScore = int(scores?.overall?.value);
  fields.sleepSeconds = int(dto.sleepTimeSeconds);
  if (fields.restingHr == null) fields.restingHr = int(sl?.restingHeartRate ?? dto.restingHeartRate);

  // HRV status
  const hs = (hrv as { hrvSummary?: Record<string, unknown> } | null)?.hrvSummary;
  fields.hrvLastNight = int(hs?.lastNightAvg ?? sl?.avgOvernightHrv);
  fields.hrvWeeklyAvg = int(hs?.weeklyAvg);
  fields.hrvStatus = str(hs?.status);

  // Training status / load (acute-chronic)
  const latest = (training as { mostRecentTrainingStatus?: { latestTrainingStatusData?: Record<string, Record<string, unknown>> }; mostRecentVO2Max?: { generic?: { vo2MaxValue?: unknown } } } | null);
  const perDevice = latest?.mostRecentTrainingStatus?.latestTrainingStatusData ?? {};
  const first = Object.values(perDevice)[0] as Record<string, unknown> | undefined;
  const acute = (first?.acuteTrainingLoadDTO as Record<string, unknown> | undefined) ?? undefined;
  fields.trainingStatus = str(first?.trainingStatusFeedbackPhrase) ?? str(first?.trainingStatus);
  fields.acuteLoad = num(acute?.dailyTrainingLoadAcute);
  fields.chronicLoad = num(acute?.dailyTrainingLoadChronic);
  fields.acwr = num(acute?.acwrPercent) != null ? (num(acute?.acwrPercent) as number) / 100 : null;
  fields.vo2Max = num(latest?.mostRecentVO2Max?.generic?.vo2MaxValue);

  // Training readiness (array of readings; take the latest)
  const rl = Array.isArray(readiness) ? (readiness as Record<string, unknown>[]) : readiness && typeof readiness === "object" ? [readiness as Record<string, unknown>] : [];
  const rd = rl.length ? rl[rl.length - 1] : undefined;
  fields.trainingReadiness = int(rd?.score);
  fields.readinessLevel = str(rd?.level);

  fields.raw = JSON.stringify(raw);
  return { day: d, fields, errors };
}

/** Sync the last `days` days for one link. Returns a per-day error digest. */
export async function syncGarminLink(linkId: string, days = 14): Promise<{ userId: string; days: number; errors: string[] }> {
  const link = await raw().garminLink.findUnique({ where: { id: linkId } });
  if (!link) throw new Error("GarminLink not found");
  const { client, displayName } = await clientForLink(linkId);

  let name = displayName;
  if (!name) {
    try {
      const profile = await client.getUserProfile();
      name = (profile as { displayName?: string }).displayName ?? null;
    } catch {
      /* summary endpoint just gets skipped */
    }
  }

  const allErrors: string[] = [];
  const results: GarminDayResult[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const r = await fetchGarminDay(client, name, d);
    results.push(r);
    if (r.errors.length) allErrors.push(`${r.day}: ${r.errors.join("; ")}`);
  }

  await runAsUser(link.userId, async () => {
    for (const r of results) {
      const { raw, ...rest } = r.fields as { raw: string } & Record<string, unknown>;
      const hasAny = Object.values(rest).some((v) => v != null);
      if (!hasAny) continue; // nothing Garmin knows about that day
      await prisma.garminDaily.upsert({
        where: { userId_day: { userId: link.userId, day: dateStrToUTC(r.day) } },
        create: { userId: link.userId, day: dateStrToUTC(r.day), ...(rest as object), raw },
        update: { ...(rest as object), raw },
      });
    }
  });

  // Persist refreshed tokens + status (GarminLink is owned; write with the tenant pinned).
  const fresh = client.exportToken();
  const fatal = results.length > 0 && results.every((r) => r.errors.length >= 5);
  await runAsUser(link.userId, () =>
    prisma.garminLink.update({
      where: { id: linkId },
      data: {
        tokens: JSON.stringify(fresh),
        displayName: name,
        lastSyncAt: new Date(),
        status: fatal ? "error" : "active",
        lastError: allErrors.length ? allErrors.slice(-3).join(" | ").slice(0, 2000) : null,
      },
    }),
  );
  return { userId: link.userId, days: results.length, errors: allErrors };
}

/** Every active link, oldest sync first. Used by the daily cron. */
export async function syncAllGarminLinks(days = 7): Promise<{ synced: number; results: { userId: string; days: number; errors: number }[] }> {
  const links = await raw().garminLink.findMany({ where: { status: { not: "revoked" } }, orderBy: { lastSyncAt: "asc" } });
  const results = [] as { userId: string; days: number; errors: number }[];
  for (const l of links) {
    try {
      const r = await syncGarminLink(l.id, days);
      results.push({ userId: r.userId, days: r.days, errors: r.errors.length });
    } catch (e) {
      results.push({ userId: l.userId, days: 0, errors: 1 });
      await runAsUser(l.userId, () => prisma.garminLink.update({ where: { id: l.id }, data: { status: "error", lastError: (e instanceof Error ? e.message : String(e)).slice(0, 2000) } })).catch(() => {});
    }
  }
  return { synced: results.length, results };
}
