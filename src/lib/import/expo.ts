import { prisma } from "@/lib/db";
import { runAsUser } from "@/lib/current-user";
import { dateStrToUTC, wallTimeToUtc } from "@/lib/date-utils";
import { estimateMacros } from "@/lib/usda";

/**
 * Import of the Expo pilot app's on-device data (2026-09-24).
 *
 * The pilot app (~/Downloads/baseline/baseline-app) keeps everything on the
 * phone: a daily-log JSON, an experiment-program JSON, the intake answers,
 * goals. When a tester moves to this app, "Send my data" in the pilot POSTs
 * that bundle to /api/import/expo with a per-account ImportCode, and this
 * module lands it under that tenant.
 *
 * Idempotent: re-sending is safe. Tags/felt/notes are replaced wholesale
 * (they are source-marked "expo-import"); meals are skipped when an entry
 * with the same food + eaten-time already exists; manual sleep never
 * overwrites a device night; closed experiments are keyed by the pilot's
 * prereg id. The raw intake/goals/program bundle is stored verbatim on
 * User.importedExpo for the web onboarding to use later.
 *
 * Nothing here runs analysis. Medication names never arrive (the pilot
 * strips them before sending; we strip again on receipt).
 */

/* ---------------- payload shape (mirrors baseline-app/src/core) ---------------- */

export interface ExpoMeal {
  at: string; // HH:MM 24h, as the person stated it
  label: string;
  tags?: string[];
}

export interface ExpoDayEntry {
  date: string; // YYYY-MM-DD local calendar date
  tags: string[];
  meals?: ExpoMeal[];
  lastNight?: { bed: string; wake: string }; // HH:MM 24h; night ENDING this morning
  felt?: number; // 1–5
  medsTaken?: boolean;
  note?: string;
  savedAt?: string;
}

export interface ExpoScheduleDay {
  date: string;
  block: number;
  arm: "A" | "B";
  analyzed: boolean;
}

export interface ExpoExperimentRecord {
  prereg: {
    id: string;
    lockedAt: string;
    question: string;
    tagId: string;
    tagLabel: string;
    primaryOutcome: string;
    metric: string;
    ownSd: number;
    swc: number;
    blocks: number;
    washoutDiscardDays?: number;
    [k: string]: unknown;
  };
  schedule: ExpoScheduleDay[];
  extended?: boolean;
  verdict?: {
    decision: string;
    usableBlocks?: number;
    adherence?: number | null;
    effect?: number;
    randTestP?: number;
    pEffectGtSwc?: number;
    feltDelta?: number | null;
    [k: string]: unknown;
  };
  closedAt?: string;
}

export interface ExpoPayload {
  v: 1;
  exportedAt: string;
  tz: string; // IANA zone of the phone at export time
  log: ExpoDayEntry[];
  program?: { v?: number; active?: ExpoExperimentRecord | null; history?: ExpoExperimentRecord[] } | null;
  intake?: Record<string, unknown> | null;
  goals?: unknown[] | null;
}

export interface ImportReport {
  userId: string;
  tz: string;
  days: number;
  tags: number;
  felt: number;
  notes: number;
  meals: { created: number; skippedExisting: number; estimateFailed: number };
  sleep: { created: number; updated: number; keptDevice: number; rejected: number };
  experiments: { created: number; existing: number; activeKeptRaw: number };
  baselineStartedAt: string | null;
}

/* ---------------- validation ---------------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DAYS = 2000;
const MAX_TAGS_PER_DAY = 40;
const MAX_MEALS_PER_DAY = 30;
const MAX_LABEL = 200;
const MAX_NOTE = 2000;

export class ExpoImportError extends Error {
  status = 400;
}

function isValidTz(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validatePayload(raw: unknown): ExpoPayload {
  if (!raw || typeof raw !== "object") throw new ExpoImportError("Body must be a JSON object");
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) throw new ExpoImportError("Unsupported payload version");
  if (!isValidTz(o.tz)) throw new ExpoImportError("tz must be a valid IANA timezone");
  if (!Array.isArray(o.log)) throw new ExpoImportError("log must be an array");
  if (o.log.length > MAX_DAYS) throw new ExpoImportError(`log has more than ${MAX_DAYS} days`);

  const seen = new Set<string>();
  const log: ExpoDayEntry[] = o.log.map((e, i) => {
    if (!e || typeof e !== "object") throw new ExpoImportError(`log[${i}] is not an object`);
    const d = e as Record<string, unknown>;
    if (typeof d.date !== "string" || !DATE_RE.test(d.date)) throw new ExpoImportError(`log[${i}].date invalid`);
    if (seen.has(d.date)) throw new ExpoImportError(`log has two entries for ${d.date}`);
    seen.add(d.date);
    const tags = Array.isArray(d.tags) ? d.tags : [];
    if (tags.length > MAX_TAGS_PER_DAY || !tags.every((t) => typeof t === "string" && t.length <= 64)) {
      throw new ExpoImportError(`log[${i}].tags invalid`);
    }
    const meals = Array.isArray(d.meals) ? d.meals : [];
    if (meals.length > MAX_MEALS_PER_DAY) throw new ExpoImportError(`log[${i}].meals too many`);
    const cleanMeals: ExpoMeal[] = meals.map((m, j) => {
      const mm = (m ?? {}) as Record<string, unknown>;
      if (typeof mm.at !== "string" || !TIME_RE.test(mm.at)) throw new ExpoImportError(`log[${i}].meals[${j}].at invalid`);
      if (typeof mm.label !== "string" || !mm.label.trim() || mm.label.length > MAX_LABEL) {
        throw new ExpoImportError(`log[${i}].meals[${j}].label invalid`);
      }
      return { at: mm.at, label: mm.label.trim() };
    });
    let lastNight: ExpoDayEntry["lastNight"];
    if (d.lastNight && typeof d.lastNight === "object") {
      const ln = d.lastNight as Record<string, unknown>;
      if (typeof ln.bed === "string" && TIME_RE.test(ln.bed) && typeof ln.wake === "string" && TIME_RE.test(ln.wake)) {
        lastNight = { bed: ln.bed, wake: ln.wake };
      }
    }
    const felt = typeof d.felt === "number" && Number.isInteger(d.felt) && d.felt >= 1 && d.felt <= 5 ? d.felt : undefined;
    const note = typeof d.note === "string" && d.note.trim() ? d.note.trim().slice(0, MAX_NOTE) : undefined;
    return {
      date: d.date,
      tags: [...new Set(tags as string[])],
      meals: cleanMeals,
      lastNight,
      felt,
      medsTaken: d.medsTaken === true,
      note,
      savedAt: typeof d.savedAt === "string" ? d.savedAt : undefined,
    };
  });

  return {
    v: 1,
    exportedAt: typeof o.exportedAt === "string" ? o.exportedAt : new Date().toISOString(),
    tz: o.tz,
    log,
    program: (o.program as ExpoPayload["program"]) ?? null,
    intake: stripMedNames(o.intake),
    goals: Array.isArray(o.goals) ? o.goals : null,
  };
}

/** The pilot never sends med names, but the engine rule is "never stored" — enforce on receipt too. */
function stripMedNames(intake: unknown): Record<string, unknown> | null {
  if (!intake || typeof intake !== "object") return null;
  const o = { ...(intake as Record<string, unknown>) };
  if (Array.isArray(o.meds)) {
    o.meds = o.meds.map((m) => {
      const mm = (m ?? {}) as Record<string, unknown>;
      const { name: _drop, ...rest } = mm;
      void _drop;
      return rest;
    });
  }
  return o;
}

/* ---------------- tag vocabulary ---------------- */

const TAG_SOURCE = "expo-import";
const CHECKIN_TIME = "21:00"; // the pilot's check-in is an evening ritual; the log stores no clock time

/** Expo tag id → this app's ActivityTag category. Tag ids are kept as-is so
 *  the person's own vocabulary stays stable across the two apps. */
const TAG_CATEGORY: Record<string, string> = {
  caffeine_late: "caffeine",
  alcohol: "alcohol",
  late_meal: "nutrition",
  big_meal: "nutrition",
  spicy: "nutrition",
  dairy: "nutrition",
  ate_out: "nutrition",
  late_workout: "exercise",
  rest_day: "exercise",
  sauna: "exercise",
};

function categoryFor(tagId: string): string {
  return TAG_CATEGORY[tagId] ?? "custom";
}

function mealTypeFor(hhmm: string): "breakfast" | "lunch" | "dinner" {
  // House convention: breakfast before noon, lunch 12–5 PM, dinner 5 PM on.
  const h = Number(hhmm.slice(0, 2));
  if (h < 12) return "breakfast";
  if (h < 17) return "lunch";
  return "dinner";
}

function prevDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ---------------- the import ---------------- */

export async function importExpoPayload(userId: string, payload: ExpoPayload): Promise<ImportReport> {
  return runAsUser(userId, async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, baselineStartedAt: true } });
    if (!user) throw new ExpoImportError("Unknown user");
    const tz = user.timezone ?? payload.tz;

    const report: ImportReport = {
      userId,
      tz,
      days: payload.log.length,
      tags: 0,
      felt: 0,
      notes: 0,
      meals: { created: 0, skippedExisting: 0, estimateFailed: 0 },
      sleep: { created: 0, updated: 0, keptDevice: 0, rejected: 0 },
      experiments: { created: 0, existing: 0, activeKeptRaw: 0 },
      baselineStartedAt: null,
    };

    /* ---- 1. tags / felt / notes / meds flag: wholesale replace ---- */
    await prisma.activityTag.deleteMany({ where: { source: TAG_SOURCE } });
    const tagRows: {
      userId: string;
      tag: string;
      category: string;
      timestamp: Date;
      metadata: string;
      source: string;
    }[] = [];
    for (const day of payload.log) {
      const ts = wallTimeToUtc(day.date, CHECKIN_TIME, tz);
      const base = { userId, timestamp: ts, source: TAG_SOURCE };
      for (const t of day.tags) {
        tagRows.push({ ...base, tag: t, category: categoryFor(t), metadata: JSON.stringify({ date: day.date, from: "expo" }) });
        report.tags += 1;
      }
      if (day.felt) {
        tagRows.push({ ...base, tag: "felt", category: "checkin", metadata: JSON.stringify({ date: day.date, value: day.felt, from: "expo" }) });
        report.felt += 1;
      }
      if (day.note) {
        tagRows.push({ ...base, tag: "note", category: "checkin", metadata: JSON.stringify({ date: day.date, text: day.note, from: "expo" }) });
        report.notes += 1;
      }
      if (day.medsTaken) {
        tagRows.push({ ...base, tag: "meds_taken", category: "custom", metadata: JSON.stringify({ date: day.date, from: "expo" }) });
      }
    }
    if (tagRows.length) await prisma.activityTag.createMany({ data: tagRows });

    /* ---- 2. self-reported sleep: device nights always win ---- */
    for (const day of payload.log) {
      if (!day.lastNight) continue;
      const { bed, wake } = day.lastNight;
      const bedDate = bed > wake ? prevDate(day.date) : day.date;
      const start = wallTimeToUtc(bedDate, bed, tz);
      const end = wallTimeToUtc(day.date, wake, tz);
      const secs = Math.round((end.getTime() - start.getTime()) / 1000);
      if (secs <= 0 || secs >= 18 * 3600) {
        report.sleep.rejected += 1;
        continue;
      }
      const dayUtc = dateStrToUTC(day.date);
      const manualId = `expo-manual-${userId}-${day.date}`;
      const existing = await prisma.dailySleep.findUnique({ where: { userId_day: { userId, day: dayUtc } }, select: { id: true } });
      if (existing && existing.id !== manualId) {
        report.sleep.keptDevice += 1;
        continue;
      }
      const data = { bedtimeStart: start, bedtimeEnd: end, totalSleepDuration: secs };
      if (existing) {
        await prisma.dailySleep.update({ where: { id: manualId }, data });
        report.sleep.updated += 1;
      } else {
        await prisma.dailySleep.create({ data: { id: manualId, userId, day: dayUtc, ...data } });
        report.sleep.created += 1;
      }
    }

    /* ---- 3. meals: skip exact duplicates, estimate macros once per label ---- */
    const estimateCache = new Map<string, Awaited<ReturnType<typeof estimateMacros>> | null>();
    for (const day of payload.log) {
      if (!day.meals?.length) continue;
      const dayUtc = dateStrToUTC(day.date);
      let log = await prisma.nutritionLog.findUnique({ where: { userId_day: { userId, day: dayUtc } } });
      for (const meal of day.meals) {
        const eatenAt = wallTimeToUtc(day.date, meal.at, tz);
        const dup = await prisma.nutritionEntry.findFirst({
          where: { foodName: meal.label, eatenAt },
          select: { id: true },
        });
        if (dup) {
          report.meals.skippedExisting += 1;
          continue;
        }
        const key = meal.label.toLowerCase();
        if (!estimateCache.has(key)) {
          try {
            estimateCache.set(key, await estimateMacros(meal.label));
          } catch {
            estimateCache.set(key, null);
          }
        }
        const ests = estimateCache.get(key);
        if (!log) {
          log = await prisma.nutritionLog.create({ data: { userId, day: dayUtc, calories: 0, protein: 0, carbs: 0, fat: 0 } });
        }
        // One entry per meal, named by the person's own label so the
        // duplicate check above stays stable across re-sends. Macros are the
        // estimator's total for the label; zeros when it was unavailable.
        const total = (ests ?? []).reduce(
          (acc, e) => ({ calories: acc.calories + e.calories, protein: acc.protein + e.protein, carbs: acc.carbs + e.carbs, fat: acc.fat + e.fat }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 },
        );
        if (!ests) report.meals.estimateFailed += 1;
        await prisma.nutritionEntry.create({
          data: {
            userId,
            nutritionLogId: log.id,
            description: ests?.length ? ests.map((e) => e.description).join(", ") : meal.label,
            foodName: meal.label,
            quantity: 1,
            unit: "serving",
            calories: total.calories,
            protein: total.protein,
            carbs: total.carbs,
            fat: total.fat,
            mealType: mealTypeFor(meal.at),
            eatenAt,
            timeUnknown: false,
          },
        });
        await prisma.nutritionLog.update({
          where: { id: log.id },
          data: {
            calories: { increment: total.calories },
            protein: { increment: total.protein },
            carbs: { increment: total.carbs },
            fat: { increment: total.fat },
          },
        });
        report.meals.created += 1;
      }
    }

    /* ---- 4. experiments: closed runs become analyzed rows; an active run stays raw ---- */
    const history = payload.program?.history ?? [];
    for (const rec of history) {
      if (!rec?.prereg?.id || !Array.isArray(rec.schedule) || !rec.verdict) continue;
      const marker = `"expoPreregId":"${rec.prereg.id}"`;
      const exists = await prisma.experiment.findFirst({ where: { preReg: { contains: marker } }, select: { id: true } });
      if (exists) {
        report.experiments.existing += 1;
        continue;
      }
      const dates = rec.schedule.map((s) => s.date).filter((d) => DATE_RE.test(d)).sort();
      if (!dates.length) continue;
      const assignments = rec.schedule.map((s, idx) => {
        const logged = payload.log.find((d) => d.date === s.date);
        const done = !!logged && (s.arm === "B" || logged.tags.includes(rec.prereg.tagId));
        return {
          idx,
          pairIdx: s.block,
          date: s.date,
          arm: s.arm,
          done,
          value: null,
          excluded: s.analyzed ? null : "analytic washout (pre-registered)",
        };
      });
      const decision = (
        ["effect_found", "no_effect_at_mde", "inconclusive", "inconclusive_low_adherence"] as const
      ).includes(rec.verdict.decision as never)
        ? rec.verdict.decision
        : "inconclusive";
      await prisma.experiment.create({
        data: {
          userId,
          title: rec.prereg.question || rec.prereg.tagLabel,
          hypothesis: rec.prereg.question || "",
          independentVariable: rec.prereg.tagLabel,
          dependentVariable: rec.prereg.primaryOutcome,
          dependentMetric: rec.prereg.primaryOutcome,
          metricSource: "expo-pilot",
          lagDays: 0,
          startDate: dateStrToUTC(dates[0]),
          endDate: dateStrToUTC(dates[dates.length - 1]),
          minDays: rec.schedule.length,
          status: "analyzed",
          assignments: JSON.stringify(assignments),
          preReg: JSON.stringify({
            outcome: rec.prereg.primaryOutcome,
            swc: rec.prereg.swc,
            mde: typeof rec.verdict.mde === "number" ? rec.verdict.mde : rec.prereg.swc,
            baselineSd: rec.prereg.ownSd,
            baselineMean: 0,
            blocks: rec.prereg.blocks,
            exclusionRule: "none (pilot v1)",
            analysis: "randomization test on block differences (pilot app)",
            lockedAt: rec.prereg.lockedAt,
            expoPreregId: rec.prereg.id,
            importedFrom: "expo",
          }),
          resultJson: JSON.stringify({
            pEffectGtSWC: typeof rec.verdict.pEffectGtSwc === "number" ? rec.verdict.pEffectGtSwc : 0.5,
            randTestP: typeof rec.verdict.randTestP === "number" ? rec.verdict.randTestP : 1,
            feltDelta: rec.verdict.feltDelta ?? null,
            decision,
            pairsUsed: rec.verdict.usableBlocks ?? 0,
            importedFrom: "expo",
            effect: rec.verdict.effect ?? null,
          }),
        },
      });
      report.experiments.created += 1;
    }
    if (payload.program?.active) report.experiments.activeKeptRaw = 1;

    /* ---- 5. questionnaire / goals / program: kept verbatim for onboarding ---- */
    const loggedDates = payload.log.map((d) => d.date).sort();
    const firstDay = loggedDates[0] ? dateStrToUTC(loggedDates[0]) : null;
    const baselineStartedAt =
      user.baselineStartedAt && (!firstDay || user.baselineStartedAt <= firstDay) ? user.baselineStartedAt : firstDay;
    await prisma.user.update({
      where: { id: userId },
      data: {
        importedExpo: JSON.stringify({
          importedAt: new Date().toISOString(),
          exportedAt: payload.exportedAt,
          phoneTz: payload.tz,
          intake: payload.intake,
          goals: payload.goals,
          program: payload.program,
        }),
        ...(baselineStartedAt && baselineStartedAt !== user.baselineStartedAt ? { baselineStartedAt } : {}),
        ...(!user.timezone ? { timezone: payload.tz } : {}),
      },
    });
    report.baselineStartedAt = baselineStartedAt?.toISOString() ?? null;

    return report;
  });
}
