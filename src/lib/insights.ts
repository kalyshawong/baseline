import { prisma } from "./db";
// @ts-expect-error — jstat has no type declarations
import { jStat } from "jstat";

export interface InsightMetric {
  metric: string;
  metricLabel: string;
  taggedMean: number;
  untaggedMean: number;
  /** Raw medians — the DISPLAY numbers (outlier-resistant; redesign spec). */
  taggedMedian: number;
  untaggedMedian: number;
  percentDiff: number;
  /** FDR-adjusted (q). The max of Welch and Mann–Whitney p pre-adjustment. */
  pValue: number;
}

export interface Insight {
  tag: string;
  category: string;
  direction: "higher" | "lower";
  significance: "significant" | "suggestive" | "watching";
  taggedN: number;
  untaggedN: number;
  // Human-readable description of what the comparison's control set was. Lets
  // the card explain "1h 48m vs 1h 26m" without leaving the reader guessing
  // which days are in the second bucket (untagged? sibling tags? everyone?).
  controlLabel: string;
  recommendation: string;
  metrics: InsightMetric[];
  /** Rigor chips actually satisfied (redesign): all true by construction. */
  checks: string[];
  /** "What else differed" — co-occurring tags that could carry the effect. */
  confounders: string[];
}

/** Tags still accumulating toward the 14-day evidence floor. */
export interface CollectingTag {
  tag: string;
  category: string;
  have: number;
  need: number;
}

export interface FindingsResult {
  patterns: Insight[];
  collecting: CollectingTag[];
}

// AUDIT (baseline-audit.md §2.2): deep sleep / sleep efficiency / WASO are
// BANNED as outcomes — consumer stage detection carries −25..+73 min bias and
// 29–52% wake specificity, so "effects" smaller than the instrument's error
// band are noise. Approved outcomes only: total sleep time, nocturnal RHR,
// HRV as deviation from the user's own 7-day baseline, temperature
// deviation, and the readiness composite.
const metricConfigs = [
  { field: "score", label: "readiness", source: "DailyReadiness", unit: "", higherIsBetter: true },
  { field: "totalSleepDuration", label: "total sleep", source: "DailySleep", unit: "sec", higherIsBetter: true },
  { field: "lowestHeartRate", label: "nocturnal resting HR", source: "DailySleep", unit: "bpm", higherIsBetter: false },
  { field: "hrvVsBaseline", label: "HRV vs 7-day baseline", source: "DailySleep", unit: "ms", higherIsBetter: true },
  { field: "temperatureDeviation", label: "temp deviation", source: "DailyReadiness", unit: "°C", higherIsBetter: false },
] as const;

function welchP(a: number[], b: number[]): number {
  if (a.length < 3 || b.length < 3) return 1;
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (a.length - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (b.length - 1);
  const se = Math.sqrt(varA / a.length + varB / b.length);
  if (se === 0) return 1;
  const t = (meanA - meanB) / se;
  const num = (varA / a.length + varB / b.length) ** 2;
  const denom = (varA / a.length) ** 2 / (a.length - 1) + (varB / b.length) ** 2 / (b.length - 1);
  const df = num / denom;
  return 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
}

/** Median of a non-empty array. */
function median(xs: number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Mann–Whitney U test p-value (normal approximation with tie correction).
 * The redesign's "rank & mean stats agree" check: a finding must survive
 * BOTH this and Welch's t, so a few outlier nights can't fake a pattern.
 */
function mannWhitneyP(a: number[], b: number[]): number {
  const n1 = a.length, n2 = b.length;
  if (n1 < 3 || n2 < 3) return 1;
  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))]
    .sort((x, y) => x.v - y.v);
  // assign ranks with ties averaged
  const ranks = new Array(all.length).fill(0);
  let i = 0;
  const tieGroups: number[] = [];
  while (i < all.length) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    if (j > i) tieGroups.push(j - i + 1);
    i = j + 1;
  }
  let r1 = 0;
  for (let k = 0; k < all.length; k++) if (all[k].g === 0) r1 += ranks[k];
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const n = n1 + n2;
  const tieCorr = tieGroups.reduce((s2, t) => s2 + (t ** 3 - t), 0);
  const sigma = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieCorr / (n * (n - 1))));
  if (sigma === 0) return 1;
  const z = Math.abs((u1 - mu - Math.sign(u1 - mu) * 0.5) / sigma); // continuity corr.
  return 2 * (1 - jStat.normal.cdf(z, 0, 1));
}

/**
 * Detrend + cycle-adjust a day→value series (audit §2.1.2/§2.1.4).
 *
 * 1. DETREND: subtract an OLS linear fit over calendar time, so a slow
 *    drift (fitness gain, seasonal change) can't masquerade as a tag effect
 *    when tagging habits also drift.
 * 2. CYCLE-ADJUST: subtract each cycle phase's own mean residual, so a tag
 *    that clusters in (say) follicular days can't inherit the phase's
 *    physiology as its "effect". Days with unknown phase form their own
 *    stratum (no-op within it).
 *
 * Returns residuals keyed by day. Display code should keep using RAW values
 * (medians of residuals aren't human-readable); these residuals are for the
 * test statistics only.
 */
function detrendAndAdjust(
  valueByDay: Map<string, number>,
  phaseByDay: Map<string, string>,
): Map<string, number> {
  const entries = [...valueByDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  if (entries.length < 3) return new Map(entries);
  const t0 = new Date(entries[0][0] + "T00:00:00Z").getTime();
  const xs = entries.map(([d]) => (new Date(d + "T00:00:00Z").getTime() - t0) / 86_400_000);
  const ys = entries.map(([, v]) => v);
  const mx = xs.reduce((s2, x) => s2 + x, 0) / xs.length;
  const my = ys.reduce((s2, y) => s2 + y, 0) / ys.length;
  let num = 0, den = 0;
  for (let k = 0; k < xs.length; k++) {
    num += (xs[k] - mx) * (ys[k] - my);
    den += (xs[k] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const resid = new Map<string, number>();
  entries.forEach(([d, v], k) => resid.set(d, v - (my + slope * (xs[k] - mx))));

  // phase strata means
  const sums = new Map<string, { s: number; n: number }>();
  for (const [d, r] of resid) {
    const ph = phaseByDay.get(d) ?? "unknown";
    const cur = sums.get(ph) ?? { s: 0, n: 0 };
    cur.s += r; cur.n += 1;
    sums.set(ph, cur);
  }
  for (const [d, r] of resid) {
    const ph = phaseByDay.get(d) ?? "unknown";
    const { s: s2, n } = sums.get(ph)!;
    resid.set(d, r - s2 / n);
  }
  return resid;
}

function generateRecommendation(
  tag: string,
  metricLabels: string[],
  direction: "higher" | "lower",
  significance: string,
  allHigherIsBetter: boolean[],
): string {
  const metricsStr = metricLabels.join(" and ");
  const isGood = allHigherIsBetter.every((hib) =>
    (direction === "higher" && hib) || (direction === "lower" && !hib)
  );

  // AUDIT §2.1: NO causal copy, NO behavioral directives ("keep it up",
  // "consider reducing" are deleted). Cards describe the past and point at
  // the one legitimate next step: a randomized test.
  const goodBad = isGood ? "in the direction you'd want" : "in the direction you wouldn't want";
  if (significance === "significant" || significance === "suggestive") {
    return `On days you logged "${tag}", your ${metricsStr} ran ${direction} — ${goodBad}. That's a description of your past, not a cause: days you chose "${tag}" may differ in other ways. A randomized test can split that.`;
  }
  return `Days with "${tag}" show a weak lean in ${metricsStr}. Below the confidence bar — treat as noise until tested.`;
}

interface RawFinding {
  tag: string;
  category: string;
  metric: string;
  metricLabel: string;
  taggedMean: number;
  untaggedMean: number;
  percentDiff: number;
  direction: "higher" | "lower";
  pValue: number;
  taggedN: number;
  untaggedN: number;
  higherIsBetter: boolean;
  controlLabel: string;
  taggedMedian: number;
  untaggedMedian: number;
}

/** Per-metric day-indexed series: raw for display, residuals for testing. */
type MetricSeries = Map<
  string,
  { raw: Map<string, number>; resid: Map<string, number> }
>;

/** Compare two groups across all biometric metrics, push significant findings. */
function compareBuckets(
  tagName: string,
  category: string,
  taggedDays: Set<string>,
  controlDays: Set<string>,
  series: MetricSeries,
  out: RawFinding[],
  controlLabel: string,
  testCounter: { tests: number },
) {
  for (const metric of metricConfigs) {
    const ms = series.get(metric.field);
    if (!ms) continue;

    const tRaw: number[] = [], cRaw: number[] = [];
    const tRes: number[] = [], cRes: number[] = [];
    for (const day of taggedDays) {
      const r = ms.raw.get(day), e = ms.resid.get(day);
      if (r != null && e != null) { tRaw.push(r); tRes.push(e); }
    }
    for (const day of controlDays) {
      const r = ms.raw.get(day), e = ms.resid.get(day);
      if (r != null && e != null) { cRaw.push(r); cRes.push(e); }
    }

    // AUDIT §2.1 (Omnio bar): fewer than 14 observations per side is below
    // the publishable-correlation floor — n=4 "spirits" cards die here.
    if (tRaw.length < 14 || cRaw.length < 14) continue;

    // Test statistics run on DETRENDED + CYCLE-ADJUSTED residuals; display
    // numbers stay raw (medians, outlier-resistant).
    const pWelch = welchP(tRes, cRes);
    const pRank = mannWhitneyP(tRes, cRes);
    testCounter.tests += 1;

    const tMed = median(tRaw), cMed = median(cRaw);
    const tResMean = tRes.reduce((a, b) => a + b, 0) / tRes.length;
    const cResMean = cRes.reduce((a, b) => a + b, 0) / cRes.length;

    // Agreement gate (redesign "rank & mean stats agree"): both tests under
    // 0.10 AND the adjusted-mean and raw-median differences point the same
    // way. Disagreement → flag internally by NOT showing (Omnio rule).
    const medDiff = tMed - cMed;
    const resDiff = tResMean - cResMean;
    if (pWelch >= 0.10 || pRank >= 0.10) continue;
    if (medDiff !== 0 && resDiff !== 0 && Math.sign(medDiff) !== Math.sign(resDiff)) continue;

    const pctDiff = cMed !== 0 ? Math.abs((medDiff / cMed) * 100) : 0;
    if (pctDiff < 5) continue;

    const tMean = tRaw.reduce((a, b) => a + b, 0) / tRaw.length;
    const cMean = cRaw.reduce((a, b) => a + b, 0) / cRaw.length;

    out.push({
      tag: tagName,
      category,
      metric: metric.field,
      metricLabel: metric.label,
      taggedMean: Math.round(tMean * 100) / 100,
      untaggedMean: Math.round(cMean * 100) / 100,
      taggedMedian: Math.round(tMed * 100) / 100,
      untaggedMedian: Math.round(cMed * 100) / 100,
      percentDiff: Math.round(pctDiff * 10) / 10,
      direction: (medDiff !== 0 ? medDiff : resDiff) > 0 ? "higher" : "lower",
      // conservative: the WEAKER of the two agreeing tests carries forward
      pValue: Math.round(Math.max(pWelch, pRank) * 1000) / 1000,
      taggedN: tRaw.length,
      untaggedN: cRaw.length,
      higherIsBetter: metric.higherIsBetter,
      controlLabel,
    });
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export async function generateInsights(): Promise<FindingsResult> {
  // 180 days, not 90 (2026-08-26): with journaling gaps (June–July) a 90-day
  // window silently discarded whole tag eras — "sex" showed 3/14 days when
  // 50 existed. The coverage-era clamp below already handles absence
  // honestly, and detrending + cycle adjustment handle slow drift, so the
  // wide window is safe; the hard cut was just throwing away evidence.
  const windowStart = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const [allTags, allLifeLogs, sleepData, readinessData, nutritionLogs, nutritionEntries, phaseLogs] = await Promise.all([
    prisma.activityTag.findMany({
      where: { timestamp: { gte: windowStart } },
      select: { tag: true, category: true, timestamp: true },
    }),
    prisma.lifeContextLog.findMany({
      where: { day: { gte: windowStart } },
      select: { day: true, def: { select: { label: true, category: true, groupKey: true } } },
    }),
    prisma.dailySleep.findMany({
      where: { day: { gte: windowStart } },
    }),
    prisma.dailyReadiness.findMany({
      where: { day: { gte: windowStart } },
    }),
    prisma.nutritionLog.findMany({
      where: { day: { gte: windowStart } },
      select: { day: true, calories: true, protein: true, carbs: true, fat: true },
    }),
    prisma.nutritionEntry.findMany({
      where: { createdAt: { gte: windowStart }, timeUnknown: false },
      select: { nutritionLogId: true, eatenAt: true },
    }),
    prisma.cyclePhaseLog.findMany({
      where: { day: { gte: windowStart } },
      select: { day: true, phase: true },
    }),
  ]);

  const phaseByDay = new Map(
    phaseLogs.map((r) => [r.day.toISOString().split("T")[0], r.phase]),
  );

  const sleepByDay = new Map(sleepData.map((s) => [s.day.toISOString().split("T")[0], s as unknown as Record<string, unknown>]));

  // Derived metric: tonight's HRV minus the mean of the PRIOR 7 nights —
  // the audit's "7-day-baselined HRV" (raw single nights are ~9–16% CV noise;
  // only deviation from own baseline is signal). Needs ≥3 prior nights.
  {
    const sorted = [...sleepByDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    const window: { day: string; hrv: number }[] = [];
    for (const [day, row] of sorted) {
      const hrv = row.averageHrv as number | null;
      const prior = window.filter((w) => w.day < day).slice(-7);
      if (hrv != null && prior.length >= 3) {
        const mean = prior.reduce((s2, w) => s2 + w.hrv, 0) / prior.length;
        row.hrvVsBaseline = Math.round((hrv - mean) * 10) / 10;
      } else {
        row.hrvVsBaseline = null;
      }
      if (hrv != null) window.push({ day, hrv });
    }
  }
  const readinessByDay = new Map(readinessData.map((r) => [r.day.toISOString().split("T")[0], r as unknown as Record<string, unknown>]));

  // Per-metric day-indexed series: raw values for display, detrended +
  // cycle-adjusted residuals for every test statistic (audit §2.1.2/.4).
  const series: MetricSeries = new Map();
  for (const metric of metricConfigs) {
    const raw = new Map<string, number>();
    const src = metric.source === "DailySleep" ? sleepByDay : readinessByDay;
    for (const [day, row] of src) {
      const v = row[metric.field] as number | null | undefined;
      if (v != null) raw.set(day, v);
    }
    series.set(metric.field, { raw, resid: detrendAndAdjust(raw, phaseByDay) });
  }

  const rawFindings: RawFinding[] = [];
  // Total hypothesis tests actually computed — the FDR family size. ~19+
  // uncorrected tests meant a 64% chance of a fake "finding" (audit §2.1.3).
  const testCounter = { tests: 0 };

  // ─── TAG-BASED ANALYSIS ───────────────────────────────────────────────

  const tagDays = new Map<string, { category: string; days: Set<string> }>();
  // Maps a tag label → its groupKey (when set on the underlying LifeContextDef).
  // Only LifeContextDef-backed tags carry groups; ActivityTag-backed tags are
  // always ungrouped today. If we add groups to ActivityTag later this map
  // expands; the rest of the pipeline doesn't care which source set the group.
  const labelToGroup = new Map<string, string>();
  for (const t of allTags) {
    if (t.category === "nutrition") continue;

    const dayStr = t.timestamp.toISOString().split("T")[0];
    const existing = tagDays.get(t.tag);
    if (existing) {
      existing.days.add(dayStr);
    } else {
      tagDays.set(t.tag, { category: t.category, days: new Set([dayStr]) });
    }
  }
  for (const log of allLifeLogs) {
    if (!log.def) continue;
    const dayStr = log.day.toISOString().split("T")[0];
    const key = `${log.def.label}`;
    const existing = tagDays.get(key);
    if (existing) {
      existing.days.add(dayStr);
    } else {
      tagDays.set(key, { category: `life:${log.def.category}`, days: new Set([dayStr]) });
    }
    if (log.def.groupKey) labelToGroup.set(log.def.label, log.def.groupKey);
  }

  // Invert labelToGroup so we can ask "what other tags share this group?"
  const groupToLabels = new Map<string, Set<string>>();
  for (const [label, grp] of labelToGroup) {
    const set = groupToLabels.get(grp) ?? new Set<string>();
    set.add(label);
    groupToLabels.set(grp, set);
  }

  const allBioDays = new Set([...sleepByDay.keys(), ...readinessByDay.keys()]);

  // ── JOURNALED DAYS (2026-08-20, her call) ────────────────────────────
  // "No tag" only means "didn't happen" on days she was demonstrably
  // logging. Oura bio days arrive automatically, so an unlogged month used
  // to count as 30 "days without this tag" — fabricating control data
  // ("i don't want fake data"). A day is journaled if ANY manual log
  // exists: an activity tag (any category, nutrition included), a life-
  // context log, or a food log. Days with bio data but no journaling are
  // UNKNOWN and sit out of every comparison.
  const journaledDays = new Set<string>();
  for (const t of allTags) journaledDays.add(t.timestamp.toISOString().split("T")[0]);
  for (const l of allLifeLogs) journaledDays.add(l.day.toISOString().split("T")[0]);
  for (const n of nutritionLogs) journaledDays.add(n.day.toISOString().split("T")[0]);

  const qualifiedTags = Array.from(tagDays.entries()).filter(
    ([, v]) => v.days.size >= 14, // audit §2.1: below 14 tagged days, don't even test
  );

  for (const [tagName, { category, days: taggedDaySet }] of qualifiedTags) {
    // For grouped tags, the default "everyone-else" control mixes sibling
    // tags into the comparison, which produces mirrored insights (alone
    // higher / shared-bed lower describe the same axis from opposite poles).
    // Strategy:
    //   1) Try: control = bio days with no tag in this group → cleanest
    //      comparison vs "no-context" days.
    //   2) Fallback when (1) has <5 days: control = sibling days only.
    //      This happens when the user has complete coverage on the group
    //      axis (e.g. every sleep day is tagged with one of alone/with-partner/
    //      non-partner). Pairwise-against-siblings is the next-honest move
    //      and still answers "what's the effect of this tag on the axis".
    //   3) Ungrouped tags keep the original "everyone else" control.
    const grp = labelToGroup.get(tagName);
    const siblingDays = new Set<string>();
    if (grp) {
      const siblings = groupToLabels.get(grp);
      if (siblings) {
        for (const sibling of siblings) {
          if (sibling === tagName) continue;
          const sibDayBucket = tagDays.get(sibling);
          if (!sibDayBucket) continue;
          for (const d of sibDayBucket.days) siblingDays.add(d);
        }
      }
    }

    // COVERAGE ERA: absence is only meaningful while she was actively
    // logging THIS tag. Her "sex" logging ran Mar 21 → Jun 3 then stopped
    // cold — journaled days after that (she still logged food daily) are
    // NOT credible "no" days. Era = [first log, last log] + 7d grace on
    // each side. Tags in continuous use are unaffected.
    const tagDayList = Array.from(taggedDaySet).sort();
    const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
    const eraStart = new Date(new Date(tagDayList[0] + "T00:00:00Z").getTime() - GRACE_MS)
      .toISOString().split("T")[0];
    const eraEnd = new Date(new Date(tagDayList[tagDayList.length - 1] + "T00:00:00Z").getTime() + GRACE_MS)
      .toISOString().split("T")[0];

    const cleanControl = new Set<string>();
    for (const d of allBioDays) {
      if (!journaledDays.has(d)) continue; // unlogged day = unknown, not "no"
      if (d < eraStart || d > eraEnd) continue; // outside this tag's logging era
      if (taggedDaySet.has(d)) continue;
      if (grp && siblingDays.has(d)) continue;
      cleanControl.add(d);
    }

    let controlDays = cleanControl;
    let controlLabel: string;
    if (!grp) {
      controlLabel = "logged days without this tag (while you were tracking it)";
    } else if (cleanControl.size < 5 && siblingDays.size >= 5) {
      // Fallback: compare against siblings only. Exclude any days that also
      // carry the tag itself to keep groups disjoint at the day level.
      const fallback = new Set<string>();
      for (const d of siblingDays) {
        if (!taggedDaySet.has(d)) fallback.add(d);
      }
      controlDays = fallback;
      // Build a sibling label like "Shared bed (with partner), Shared bed
      // (non-partner)" so the user can see exactly which days are in the
      // comparison bucket — without revealing how the group itself was named.
      const siblings = groupToLabels.get(grp);
      const siblingNames = siblings
        ? Array.from(siblings).filter((s) => s !== tagName)
        : [];
      controlLabel = siblingNames.length > 0
        ? `days with ${siblingNames.join(" or ")}`
        : `other ${grp} days`;
    } else {
      controlLabel = `logged days outside the ${grp} group`;
    }

    compareBuckets(tagName, category, taggedDaySet, controlDays, series, rawFindings, controlLabel, testCounter);
  }

  // Collapse mirrored findings within the same group. Even after the control
  // exclusion above, two siblings can still both produce significant findings
  // on the same metric (e.g. "alone" vs untagged days → higher deep sleep;
  // "with partner" vs untagged days → lower deep sleep). They describe the
  // same axis from opposite poles, so we keep only the strongest per
  // (groupKey, metric) — the one with the smallest p-value.
  if (labelToGroup.size > 0 && rawFindings.length > 0) {
    const ungroupedFindings: RawFinding[] = [];
    const bestPerGroupMetric = new Map<string, RawFinding>();
    for (const f of rawFindings) {
      const tagGroup = labelToGroup.get(f.tag);
      if (!tagGroup) {
        ungroupedFindings.push(f);
        continue;
      }
      const key = `${tagGroup}::${f.metric}`;
      const existing = bestPerGroupMetric.get(key);
      if (!existing || f.pValue < existing.pValue) {
        bestPerGroupMetric.set(key, f);
      }
    }
    rawFindings.length = 0;
    rawFindings.push(...ungroupedFindings, ...bestPerGroupMetric.values());
  }

  // ─── DAILY MACROS (tertile analysis) ──────────────────────────────────

  // Only analyze days where the user actually logged food (calories > 0)
  const loggedDays = nutritionLogs.filter((l) => l.calories > 0);

  if (loggedDays.length >= 9) {
    const macros = [
      { field: "calories" as const, label: "calorie" },
      { field: "protein" as const, label: "protein" },
      { field: "carbs" as const, label: "carb" },
      { field: "fat" as const, label: "fat" },
    ];

    for (const macro of macros) {
      const sorted = loggedDays.map((l) => l[macro.field]).sort((a, b) => a - b);
      const p33 = percentile(sorted, 33);
      const p66 = percentile(sorted, 66);

      const highDays = new Set<string>();
      const lowDays = new Set<string>();
      for (const l of loggedDays) {
        const dayStr = l.day.toISOString().split("T")[0];
        const val = l[macro.field];
        if (val <= p33) lowDays.add(dayStr);
        else if (val >= p66) highDays.add(dayStr);
      }

      if (highDays.size >= 5 && lowDays.size >= 5) {
        compareBuckets(
          `high ${macro.label} days`, "nutrition:macro",
          highDays, lowDays,
          series, rawFindings,
          `low ${macro.label} days`, testCounter,
        );
        compareBuckets(
          `low ${macro.label} days`, "nutrition:macro",
          lowDays, highDays,
          series, rawFindings,
          `high ${macro.label} days`, testCounter,
        );
      }
    }
  }

  // ─── EATING WINDOW ────────────────────────────────────────────────────

  // Group entries by their NutritionLog, compute eating window per day
  const logIdToDay = new Map<string, string>();
  for (const l of nutritionLogs) {
    logIdToDay.set(
      // NutritionLog doesn't have id in our select — fetch via the entries' logId
      // Actually we need the id. Let's build the map from day instead.
      l.day.toISOString().split("T")[0],
      l.day.toISOString().split("T")[0],
    );
  }

  // Group entries by day via their nutritionLogId
  const entriesByLogId = new Map<string, Date[]>();
  for (const e of nutritionEntries) {
    const arr = entriesByLogId.get(e.nutritionLogId);
    if (arr) arr.push(e.eatenAt);
    else entriesByLogId.set(e.nutritionLogId, [e.eatenAt]);
  }

  // We need log IDs to day mapping — re-fetch with id included
  // Instead, let's compute eating windows differently: group entries by date
  const entriesByDay = new Map<string, Date[]>();
  for (const e of nutritionEntries) {
    const dayStr = e.eatenAt.toISOString().split("T")[0];
    const arr = entriesByDay.get(dayStr);
    if (arr) arr.push(e.eatenAt);
    else entriesByDay.set(dayStr, [e.eatenAt]);
  }

  const shortWindow = new Set<string>(); // <8h
  const mediumWindow = new Set<string>(); // 8-12h
  const longWindow = new Set<string>(); // 12h+

  for (const [dayStr, times] of entriesByDay) {
    if (times.length < 2) continue;
    times.sort((a, b) => a.getTime() - b.getTime());
    const windowMinutes = (times[times.length - 1].getTime() - times[0].getTime()) / 60000;
    if (windowMinutes < 480) shortWindow.add(dayStr);
    else if (windowMinutes < 720) mediumWindow.add(dayStr);
    else longWindow.add(dayStr);
  }

  // Compare short vs long eating windows
  if (shortWindow.size >= 5 && longWindow.size >= 5) {
    compareBuckets(
      "short eating window (<8h)", "nutrition:timing",
      shortWindow, longWindow,
      series, rawFindings,
      "long eating-window days (12h+)", testCounter,
    );
    compareBuckets(
      "long eating window (12h+)", "nutrition:timing",
      longWindow, shortWindow,
      series, rawFindings,
      "short eating-window days (<8h)", testCounter,
    );
  }
  // Compare short vs medium
  if (shortWindow.size >= 5 && mediumWindow.size >= 5) {
    compareBuckets(
      "short eating window (<8h)", "nutrition:timing",
      shortWindow, mediumWindow,
      series, rawFindings,
      "medium eating-window days (8–12h)", testCounter,
    );
  }
  // Compare medium vs long
  if (mediumWindow.size >= 5 && longWindow.size >= 5) {
    compareBuckets(
      "long eating window (12h+)", "nutrition:timing",
      longWindow, mediumWindow,
      series, rawFindings,
      "medium eating-window days (8–12h)", testCounter,
    );
  }

  // ─── FDR CORRECTION (audit §2.1.3) ────────────────────────────────────
  // Benjamini–Hochberg across the FULL family of computed tests. Survivors
  // of the p<0.10 pre-filter are exactly the smallest p-values in the
  // family, so their local ranks equal their global ranks and the adjustment
  // is exact. pValue is REPLACED by the adjusted value everywhere downstream.
  if (rawFindings.length > 0) {
    const m = Math.max(testCounter.tests, rawFindings.length);
    const byP = [...rawFindings].sort((a, b) => a.pValue - b.pValue);
    let prevAdj = 1;
    for (let i = byP.length - 1; i >= 0; i--) {
      const rank = i + 1;
      const adj = Math.min(prevAdj, (byP[i].pValue * m) / rank, 1);
      byP[i].pValue = Math.round(adj * 1000) / 1000;
      prevAdj = adj;
    }
    // Post-adjustment cut: anything no longer under 0.15 isn't worth showing
    // even as "watching".
    const keep = new Set(byP.filter((f) => f.pValue < 0.15));
    rawFindings.splice(0, rawFindings.length, ...rawFindings.filter((f) => keep.has(f)));
  }

  // ─── GROUP & SORT ─────────────────────────────────────────────────────

  const groupKey = (f: RawFinding) => `${f.tag}::${f.direction}`;
  const groups = new Map<string, RawFinding[]>();
  for (const f of rawFindings) {
    const key = groupKey(f);
    const arr = groups.get(key);
    if (arr) {
      // Deduplicate: if this tag+direction+metric already exists, keep the
      // one with the lower p-value (can happen when eating window comparisons
      // produce the same tag from multiple bucket pairs).
      const existing = arr.find((e) => e.metric === f.metric);
      if (existing) {
        if (f.pValue < existing.pValue) {
          arr[arr.indexOf(existing)] = f;
        }
      } else {
        arr.push(f);
      }
    } else {
      groups.set(key, [f]);
    }
  }

  const insights: Insight[] = [];

  // "What else differed" (redesign confounder bundle): other tags whose
  // frequency differs sharply between this tag's days and its control days.
  function confoundersFor(target: string, taggedSet: Set<string>, controlSet: Set<string>): string[] {
    const lines: { line: string; ratio: number }[] = [];
    for (const [other, bucket] of tagDays) {
      if (other === target) continue;
      let onTagged = 0, onControl = 0;
      for (const d of bucket.days) {
        if (taggedSet.has(d)) onTagged++;
        else if (controlSet.has(d)) onControl++;
      }
      if (onTagged + onControl < 4) continue;
      const rT = onTagged / Math.max(taggedSet.size, 1);
      const rC = onControl / Math.max(controlSet.size, 1);
      const hi = Math.max(rT, rC), lo = Math.min(rT, rC);
      if (hi < 0.2 || hi < lo * 2) continue; // needs a real, common imbalance
      const moreOnTagged = rT > rC;
      lines.push({
        line: `"${other}" tagged on ${moreOnTagged ? onTagged : onControl} of ${moreOnTagged ? taggedSet.size : controlSet.size} ${moreOnTagged ? `"${target}" days` : "control days"} vs ${moreOnTagged ? onControl : onTagged} of ${moreOnTagged ? controlSet.size : taggedSet.size} on the other side`,
        ratio: hi / Math.max(lo, 0.01),
      });
    }
    return lines.sort((a, b) => b.ratio - a.ratio).slice(0, 3).map((l) => l.line);
  }

  for (const findings of groups.values()) {
    const best = findings.reduce((a, b) => (a.pValue < b.pValue ? a : b));
    const significance = best.pValue < 0.01
      ? "significant" as const
      : best.pValue < 0.05
        ? "suggestive" as const
        : "watching" as const;

    const taggedSet = tagDays.get(best.tag)?.days ?? new Set<string>();
    // reconstruct an approximate control set for the confounder scan: all
    // journaled bio days not tagged (era/group nuances already shaped the
    // stats; for co-occurrence description this approximation is fine).
    const controlSet = new Set<string>();
    for (const d of allBioDays) {
      if (journaledDays.has(d) && !taggedSet.has(d)) controlSet.add(d);
    }

    insights.push({
      tag: best.tag,
      category: best.category,
      direction: best.direction,
      significance,
      taggedN: best.taggedN,
      untaggedN: best.untaggedN,
      controlLabel: best.controlLabel,
      recommendation: generateRecommendation(
        best.tag,
        findings.map((f) => f.metricLabel),
        best.direction,
        significance,
        findings.map((f) => f.higherIsBetter),
      ),
      metrics: findings.map((f) => ({
        metric: f.metric,
        metricLabel: f.metricLabel,
        taggedMean: f.taggedMean,
        untaggedMean: f.untaggedMean,
        taggedMedian: f.taggedMedian,
        untaggedMedian: f.untaggedMedian,
        percentDiff: f.percentDiff,
        pValue: f.pValue,
      })),
      checks: [
        "14+ days each side",
        "Detrended",
        "Cycle-adjusted",
        "Rank & mean stats agree",
        `FDR-corrected (q = ${best.pValue < 0.001 ? "<0.001" : best.pValue})`,
        "Logged days only, within tracking era",
      ],
      confounders: confoundersFor(best.tag, taggedSet, controlSet),
    });
  }

  insights.sort((a, b) => {
    const sigOrder = { significant: 0, suggestive: 1, watching: 2 };
    if (sigOrder[a.significance] !== sigOrder[b.significance]) {
      return sigOrder[a.significance] - sigOrder[b.significance];
    }
    const aP = Math.min(...a.metrics.map((m) => m.pValue));
    const bP = Math.min(...b.metrics.map((m) => m.pValue));
    return aP - bP;
  });

  // Cap watching-tier cards at 5 to avoid a wall of marginal findings
  let watchingCount = 0;
  const patterns = insights.filter((i) => {
    if (i.significance !== "watching") return true;
    watchingCount++;
    return watchingCount <= 5;
  });

  // "Collecting" cards (redesign): tags honestly below the 14-day evidence
  // floor get a progress bar, never a claim.
  const shownTags = new Set(patterns.map((i) => i.tag));
  const collecting: CollectingTag[] = Array.from(tagDays.entries())
    .filter(([tag, v]) => v.days.size >= 3 && v.days.size < 14 && !shownTags.has(tag))
    .sort((a, b) => b[1].days.size - a[1].days.size)
    .slice(0, 6)
    .map(([tag, v]) => ({ tag, category: v.category, have: v.days.size, need: 14 }));

  return { patterns, collecting };
}
